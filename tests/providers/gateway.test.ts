import { describe, expect, it, vi } from 'vitest';
import { ProviderError } from '@/lib/providers/errors';
import { withBudget, type SpendAlert } from '@/lib/providers/gateway/budget';
import { withCache } from '@/lib/providers/gateway/cache';
import { nextUtcMidnight, utcDay } from '@/lib/providers/gateway/day';
import { createLimiter, withLimiter } from '@/lib/providers/gateway/limiter';
import { newMeter } from '@/lib/providers/gateway/meter';
import { withPacing } from '@/lib/providers/gateway/pacer';
import { backoffMs, withRetry } from '@/lib/providers/gateway/retry';
import { gateway } from '@/lib/providers/gateway/stack';
import { memoryCache, memorySlots, memorySpend } from '@/lib/providers/gateway/store/memory';
import type { GatewayPolicy, Layer, Transport } from '@/lib/providers/gateway/types';
import type { OpenAlexRequest, QueryParams } from '@/lib/providers/openalex/client';
import { openAlexConfig } from '@/lib/providers/openalex/config';
import { cacheKey, callKind, openAlexPolicy, ttlFor } from '@/lib/providers/openalex/policy';

/* The gateway's layers, tested with OpenAlex's policy (the one in use). */

const NOW = Date.UTC(2026, 10, 18, 21, 30);
const CONFIG = openAlexConfig({});
const POLICY = openAlexPolicy(CONFIG);

type Req = OpenAlexRequest;
type Client = { get(path: string, params?: QueryParams): Promise<{ body: unknown; costUsd: number; status: number }> };

/* A transport called the way the old OpenAlex client was: get(path, params). */
const asClient = (t: Transport<Req>): Client => ({ get: (path, params = {}) => t.call({ path, params }) });
const through = (layer: Layer<Req>, t: Transport<Req>) => asClient(layer(t));

/* OpenAlex's policy with a different wait limit for semantic slots. */
const withMaxWait = (maxWaitMs: number): GatewayPolicy<Req> => ({
  ...POLICY,
  describe: (r) => {
    const info = POLICY.describe(r);
    return info.pace ? { ...info, pace: { ...info.pace, maxWaitMs } } : info;
  },
});

/* A fake OpenAlex: answers every call, charging like OpenAlex does. */
function fakeOpenAlex(impl?: (path: string, params: QueryParams) => unknown) {
  const get = vi.fn(async (path: string, params: QueryParams = {}) => {
    const kind = callKind(path, params);
    const body = impl ? impl(path, params) : { results: [{ id: 'W1' }], meta: { count: 1 } };
    if (body instanceof Error) throw body;
    return { body, costUsd: kind === 'single' ? 0 : kind === 'list' ? 0.0001 : 0.001, status: 200 };
  });
  const client: Transport<Req> = { call: (r) => get(r.path, r.params) as never };
  return { client, get };
}

const busy429 = () => new ProviderError('busy', 'rate', { status: 429, retryAfterS: 1 });

describe('call kinds and days', () => {
  it('classifies calls', () => {
    expect(callKind('/works', { 'search.semantic': 'x' })).toBe('semantic');
    expect(callKind('/works', { search: 'x' })).toBe('keyword');
    expect(callKind('/works', { filter: 'cites:W1' })).toBe('list');
    expect(callKind('/works/W1', {})).toBe('single');
  });

  it('works in UTC days', () => {
    expect(utcDay(NOW)).toBe('2026-11-18');
    expect(nextUtcMidnight(NOW).toISOString()).toBe('2026-11-19T00:00:00.000Z');
  });
});

describe('cache', () => {
  it('normalizes keys: param order, spacing, filter order and semantic case', () => {
    expect(cacheKey('/works', { search: 'a  b', page: 1 })).toBe(cacheKey('/works', { page: 1, search: ' a b' }));
    expect(cacheKey('/works', { filter: 'b:1,a:2' })).toBe(cacheKey('/works', { filter: 'a:2,b:1' }));
    expect(cacheKey('/works', { 'search.semantic': 'Sleep' })).toBe(cacheKey('/works', { 'search.semantic': 'sleep' }));
    // keyword operators are case-sensitive, so keyword text keeps its case
    expect(cacheKey('/works', { search: 'a AND b' })).not.toBe(cacheKey('/works', { search: 'a and b' }));
    expect(cacheKey('/works', { search: 'x', page: 1 })).not.toBe(cacheKey('/works', { search: 'x', page: 2 }));
    expect(cacheKey('/works', { search: 'x', filter: '' })).toBe(cacheKey('/works', { search: 'x' }));
  });

  it('keeps no readable search text in the key', () => {
    expect(cacheKey('/works', { search: 'secret topic' })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('uses a day for searches and a week for papers and related lists', () => {
    expect(ttlFor('/works', { search: 'x' }, CONFIG)).toBe(86_400);
    expect(ttlFor('/works', { 'search.semantic': 'x' }, CONFIG)).toBe(86_400);
    expect(ttlFor('/works/W1', {}, CONFIG)).toBe(604_800);
    expect(ttlFor('/works', { filter: 'cites:W1' }, CONFIG)).toBe(604_800);
  });

  it('serves repeats from the cache for free, until they expire', async () => {
    let now = NOW;
    const { client, get } = fakeOpenAlex();
    const cached = through(withCache(memoryCache(() => now), POLICY), client);
    const first = await cached.get('/works', { search: 'x' });
    const second = await cached.get('/works', { search: 'x' });
    expect(get).toHaveBeenCalledTimes(1);
    expect([first.costUsd, second.costUsd]).toEqual([0.001, 0]);
    expect(second.body).toEqual(first.body);
    now += 86_400_000 + 1;
    await cached.get('/works', { search: 'x' });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('keeps searching when the cache store fails', async () => {
    const broken = { get: async () => Promise.reject(new Error('db down')), set: async () => Promise.reject(new Error('db down')) };
    const { client } = fakeOpenAlex();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(through(withCache(broken, POLICY), client).get('/works', { search: 'x' })).resolves.toMatchObject({ status: 200 });
    warn.mockRestore();
  });

  it('does not cache failures', async () => {
    let fail = true;
    const { client, get } = fakeOpenAlex(() => (fail ? new ProviderError('unavailable', 'x') : { results: [] }));
    const cached = through(withCache(memoryCache(), POLICY), client);
    await expect(cached.get('/works', { search: 'x' })).rejects.toBeInstanceOf(ProviderError);
    fail = false;
    await cached.get('/works', { search: 'x' });
    await cached.get('/works', { search: 'x' });
    expect(get).toHaveBeenCalledTimes(2);
  });
});

describe('budget', () => {
  const policy = { ...POLICY, spend: { dailyAlertUsd: 0.0015, dailyCapUsd: 0.003, configHint: 'X' } };

  it('logs every call, alerts once at each level, and stops at the cap', async () => {
    const spend = memorySpend();
    const alerts: SpendAlert[] = [];
    const { client, get } = fakeOpenAlex();
    const guarded = through(withBudget(spend, policy, (a) => void alerts.push(a), () => NOW), client);

    await guarded.get('/works', { search: 'a' }); // 0.001
    expect(alerts).toEqual([]);
    await guarded.get('/works', { search: 'b' }); // 0.002: passes the alert level
    await guarded.get('/works/W1', {}); // free
    await guarded.get('/works', { search: 'c' }); // 0.003: hits the cap
    expect(alerts.map((a) => a.kind)).toEqual(['alert', 'cap']);
    expect(alerts[1]).toMatchObject({ provider: 'openalex', label: 'OpenAlex', day: '2026-11-18', limitUsd: 0.003 });
    expect(await spend.spent('openalex', '2026-11-18')).toBeCloseTo(0.003);
    expect(await spend.spent('other', '2026-11-18')).toBe(0);

    const e = await guarded.get('/works', { search: 'd' }).catch((x) => x);
    expect(e).toMatchObject({ code: 'budget' });
    expect(get).toHaveBeenCalledTimes(4);
  });

  it('starts fresh the next UTC day', async () => {
    const spend = memorySpend();
    await spend.add('openalex', '2026-11-17', 5, true);
    const guarded = through(withBudget(spend, policy, () => {}, () => NOW), fakeOpenAlex().client);
    await expect(guarded.get('/works', { search: 'x' })).resolves.toBeTruthy();
  });
});

describe('limiter', () => {
  it('runs at most `concurrency` at once and answers busy when the queue is full', async () => {
    const limiter = createLimiter({ concurrency: 2, maxQueue: 1 });
    const gates: (() => void)[] = [];
    const slow = { call: vi.fn(() => new Promise((ok) => gates.push(() => ok({ body: {}, costUsd: 0, status: 200 })))) } as unknown as Transport<Req>;
    const client = through(withLimiter(limiter), slow);

    const calls = [client.get('/works'), client.get('/works'), client.get('/works')];
    await Promise.resolve();
    expect([limiter.active, limiter.waiting]).toEqual([2, 1]);
    await expect(client.get('/works')).rejects.toMatchObject({ code: 'busy', details: { reason: 'queue_full' } });

    gates.shift()!();
    await calls[0];
    await new Promise((ok) => setTimeout(ok, 0));
    expect([limiter.active, limiter.waiting]).toEqual([2, 0]);
    gates.splice(0).forEach((open) => open());
    await Promise.all(calls);
    expect(limiter.active).toBe(0);
  });

  it('frees the slot when a call fails', async () => {
    const limiter = createLimiter({ concurrency: 1, maxQueue: 0 });
    const client = through(withLimiter(limiter), fakeOpenAlex(() => new ProviderError('unavailable', 'x')).client);
    await expect(client.get('/works')).rejects.toBeInstanceOf(ProviderError);
    expect(limiter.active).toBe(0);
  });
});

describe('semantic pacing', () => {
  it('spaces semantic calls a second apart across callers and leaves others alone', async () => {
    const slots = memorySlots();
    let now = NOW;
    const waits: number[] = [];
    const sleep = async (ms: number) => void waits.push(ms);
    const { client, get } = fakeOpenAlex();
    const paced = through(withPacing(slots, POLICY, { now: () => now, sleep }), client);

    await Promise.all([paced.get('/works', { 'search.semantic': 'a' }), paced.get('/works', { 'search.semantic': 'b' }), paced.get('/works', { search: 'c' })]);
    expect(waits).toEqual([1100]);
    await paced.get('/works', { 'search.semantic': 'd' });
    expect(waits).toEqual([1100, 2200]);
    now += 10_000;
    await paced.get('/works', { 'search.semantic': 'e' });
    expect(waits).toEqual([1100, 2200]);
    expect(get).toHaveBeenCalledTimes(5);
  });

  it('keeps semantic search at or below one call per second under heavy load', async () => {
    const waits: number[] = [];
    const { client, get } = fakeOpenAlex();
    const paced = through(withPacing(memorySlots(), withMaxWait(60_000), { now: () => NOW, sleep: async (ms) => void waits.push(ms) }), client);
    // 20 callers at the same moment: each gets its own slot
    await Promise.all(Array.from({ length: 20 }, (_, i) => paced.get('/works', { 'search.semantic': `q${i}` })));
    const starts = [0, ...waits].sort((a, b) => a - b);
    expect(starts).toHaveLength(20);
    starts.slice(1).forEach((t, i) => expect(t - starts[i]).toBeGreaterThanOrEqual(1000));
    expect(get).toHaveBeenCalledTimes(20);
  });

  it('answers busy when the next free slot is too far away', async () => {
    const paced = through(withPacing(memorySlots(), withMaxWait(2000), { now: () => NOW, sleep: async () => {} }), fakeOpenAlex().client);
    await paced.get('/works', { 'search.semantic': 'a' }); // now
    await paced.get('/works', { 'search.semantic': 'b' }); // in 1.1s
    // the next slot is 2.2s away, past the 2s limit
    await expect(paced.get('/works', { 'search.semantic': 'c' })).rejects.toMatchObject({ code: 'busy', details: { reason: 'semantic_queue' } });
  });
});

describe('retry', () => {
  it('backs off with Retry-After, else exponentially, within limits', () => {
    expect(backoffMs(1, 1)).toBe(1000);
    expect(backoffMs(1)).toBe(1000);
    expect(backoffMs(3)).toBe(4000);
    expect(backoffMs(10)).toBe(8000);
    expect(backoffMs(1, 0)).toBe(250);
  });

  it('retries per-second 429s and then succeeds', async () => {
    let n = 0;
    const sleep = vi.fn(async () => {});
    const { client, get } = fakeOpenAlex(() => (++n < 3 ? busy429() : { results: [] }));
    await expect(through(withRetry<Req>({ sleep }), client).get('/works', { search: 'x' })).resolves.toMatchObject({ status: 200 });
    expect(get).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('gives up after the set number of tries', async () => {
    const { client, get } = fakeOpenAlex(() => busy429());
    await expect(through(withRetry<Req>({ tries: 3, sleep: async () => {} }), client).get('/works')).rejects.toMatchObject({ code: 'busy' });
    expect(get).toHaveBeenCalledTimes(3);
  });

  it('does not retry other errors, or our own busy answers', async () => {
    for (const err of [new ProviderError('unavailable', 'x'), new ProviderError('busy', 'queue', { reason: 'queue_full' }), new ProviderError('budget', 'x', { status: 429 })]) {
      const { client, get } = fakeOpenAlex(() => err);
      await expect(through(withRetry<Req>({ sleep: async () => {} }), client).get('/works')).rejects.toBe(err);
      expect(get).toHaveBeenCalledTimes(1);
    }
  });
});

describe('the full gateway', () => {
  function stack() {
    const { client, get } = fakeOpenAlex();
    const spend = memorySpend();
    const deps = {
      transport: client,
      policy: POLICY,
      cache: memoryCache(() => NOW),
      spend,
      slots: memorySlots(),
      limiter: createLimiter({ concurrency: 4, maxQueue: 10 }),
      alert: () => {},
      now: () => NOW,
      sleep: async () => {},
    };
    return { deps, get, spend };
  }

  it('meters only calls that reach the provider and logs their cost', async () => {
    const { deps, get, spend } = stack();
    const m1 = newMeter();
    await asClient(gateway(deps, m1)).get('/works', { search: 'x' });
    await asClient(gateway(deps, m1)).get('/works', { 'search.semantic': 'x' });
    expect(m1).toEqual({ searches: 2, costUsd: 0.002, calls: 2 });

    const m2 = newMeter();
    await asClient(gateway(deps, m2)).get('/works', { search: 'x' });
    expect(m2).toEqual({ searches: 0, costUsd: 0, calls: 0 });
    expect(get).toHaveBeenCalledTimes(2);
    expect(await spend.spent('openalex', '2026-11-18')).toBeCloseTo(0.002);
  });
});
