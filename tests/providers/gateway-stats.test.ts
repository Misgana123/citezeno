import { describe, expect, it, vi } from 'vitest';
import { ProviderError } from '@/lib/providers/errors';
import { createBreaker } from '@/lib/providers/gateway/breaker';
import { newFlights } from '@/lib/providers/gateway/flight';
import { createLimiter } from '@/lib/providers/gateway/limiter';
import { newMeter } from '@/lib/providers/gateway/meter';
import { gateway } from '@/lib/providers/gateway/stack';
import { statHour, statsCollector, type StatRow } from '@/lib/providers/gateway/stats';
import { memoryCache, memorySlots, memorySpend } from '@/lib/providers/gateway/store/memory';
import type { GatewayPolicy, Transport } from '@/lib/providers/gateway/types';

/* The admin page's counts: collected in memory, written in batches. */

const NOW = Date.UTC(2026, 10, 23, 14, 30);

describe('stats collector', () => {
  it('adds up counts per hour, provider and name, and writes them in one batch', async () => {
    const written: StatRow[][] = [];
    let now = NOW;
    const stats = statsCollector({ add: async (rows) => void written.push(rows) }, { now: () => now, flushMs: 60_000 });
    stats.add('openalex', 'cache_hit');
    stats.add('openalex', 'cache_hit');
    stats.add('openalex', 'call', 300);
    stats.add('openalex', 'call', 500);
    now += 3_600_000;
    stats.add('openalex', 'cache_hit');
    await stats.flush();
    expect(written).toHaveLength(1);
    expect(written[0]).toEqual([
      { hour: '2026-11-23T14', provider: 'openalex', name: 'cache_hit', count: 2, totalMs: 0 },
      { hour: '2026-11-23T14', provider: 'openalex', name: 'call', count: 2, totalMs: 800 },
      { hour: '2026-11-23T15', provider: 'openalex', name: 'cache_hit', count: 1, totalMs: 0 },
    ]);
    await stats.flush();
    expect(written).toHaveLength(1); // nothing new: nothing written
  });

  it('writes on its own after a few seconds, and a failed write is only logged', async () => {
    vi.useFakeTimers();
    try {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const add = vi.fn(async () => Promise.reject(new Error('db down')));
      const stats = statsCollector({ add }, { flushMs: 5000 });
      stats.add('openalex', 'call', 10);
      expect(add).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(5000);
      expect(add).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('names hours in UTC', () => {
    expect(statHour(Date.UTC(2026, 0, 2, 3, 59))).toBe('2026-01-02T03');
  });
});

type Req = { q: string };
const POLICY: GatewayPolicy<Req> = {
  provider: 'p',
  label: 'P',
  describe: (r) => ({ search: true, cacheKey: r.q, cacheTtlS: 60 }),
  spend: null,
  concurrency: 4,
  maxQueue: 10,
  retryTries: 2,
  rate: { perSecond: 10, maxWaitMs: 150 },
  staleS: 3600,
  breaker: { failures: 2, windowMs: 10_000, cooldownMs: 30_000 },
};

describe('what the gateway counts', () => {
  it('counts reuse, calls, errors, waits, refusals, older answers and pauses', async () => {
    let now = NOW;
    let answer: (r: Req) => unknown = (r) => ({ q: r.q });
    const call = vi.fn(async (r: Req) => {
      now += 200; // each call takes 200 ms
      const body = answer(r);
      if (body instanceof Error) throw body;
      return { body, costUsd: 0, status: 200 };
    });
    const written: StatRow[] = [];
    const stats = statsCollector({ add: async (rows) => void written.push(...rows) }, { now: () => now, flushMs: 60_000 });
    const deps = {
      transport: { call } as unknown as Transport<Req>,
      policy: POLICY,
      cache: memoryCache(() => now),
      spend: memorySpend(),
      slots: memorySlots(),
      limiter: createLimiter({ concurrency: 4, maxQueue: 10 }),
      flights: newFlights(),
      breaker: createBreaker(POLICY.breaker!, () => now, () => stats.add('p', 'paused')),
      stats,
      alert: () => {},
      now: () => now,
      sleep: async () => {},
    };
    const get = (q: string) => gateway(deps, newMeter()).call({ q });

    await get('a'); // miss, call
    await get('a'); // hit
    now += 61_000; // 'a' expires
    answer = () => new ProviderError('busy', 'slow down', { status: 429 });
    await get('a'); // miss, two calls (429, retried 429), older answer shown
    answer = () => new ProviderError('unavailable', 'down', { status: 503 });
    await get('b').catch(() => {}); // miss, call error (the provider's first failure)
    await get('c').catch(() => {}); // miss, call error: the second failure pauses it
    await get('d').catch(() => {}); // miss, refused while paused
    // three callers at the same moment, at 10 a second with a 150 ms wait limit: one waits 100 ms, one is turned away
    const slots = memorySlots();
    const t = gateway({ ...deps, slots, breaker: null, cache: memoryCache(() => now), now: () => NOW }, newMeter());
    answer = (r) => ({ q: r.q });
    await Promise.allSettled([t.call({ q: 'x' }), t.call({ q: 'y' }), t.call({ q: 'z' })]);
    await stats.flush();

    const total = (name: string) => written.filter((r) => r.name === name).reduce((s, r) => s + r.count, 0);
    const ms = (name: string) => written.filter((r) => r.name === name).reduce((s, r) => s + r.totalMs, 0);
    expect(total('cache_hit')).toBe(1);
    expect(total('cache_miss')).toBe(5 + 3);
    expect(total('call')).toBe(1 + 2 + 1 + 1 + 2); // a; a twice (429, retried); b; c; x and y
    expect(ms('call')).toBe(5 * 200); // x and y run on a stopped clock
    expect(total('call_error')).toBe(4);
    expect(total('rate_limited')).toBe(2);
    expect(total('cache_stale')).toBe(1);
    expect(total('paused')).toBe(1);
    expect(total('paused_refused')).toBe(1);
    expect(total('waited')).toBe(1);
    expect(ms('waited')).toBe(100);
    expect(total('turned_away')).toBe(1);
  });
});
