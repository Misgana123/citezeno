import { describe, expect, it, vi } from 'vitest';
import { ProviderError } from '@/lib/providers/errors';
import { createBreaker, withBreaker } from '@/lib/providers/gateway/breaker';
import { withCache } from '@/lib/providers/gateway/cache';
import { newFlights, withFlight } from '@/lib/providers/gateway/flight';
import { createLimiter } from '@/lib/providers/gateway/limiter';
import { newMeter } from '@/lib/providers/gateway/meter';
import { gateway } from '@/lib/providers/gateway/stack';
import { memoryCache, memorySlots, memorySpend } from '@/lib/providers/gateway/store/memory';
import type { GatewayPolicy, Transport } from '@/lib/providers/gateway/types';

/* Phase 3 of the gateway: one call for many identical callers, older answers
   while a provider is down, and pausing a provider that keeps failing. */

type Req = { q: string };

const POLICY: GatewayPolicy<Req> = {
  provider: 'p',
  label: 'P',
  describe: (r) => ({ search: true, cacheKey: r.q, cacheTtlS: 60 }),
  spend: null,
  concurrency: 4,
  maxQueue: 10,
  retryTries: 1,
  staleS: 3600,
  breaker: { failures: 3, windowMs: 10_000, cooldownMs: 30_000 },
};

const down = (reason = 'timeout') => new ProviderError('unavailable', 'down', { reason });

/* A fake provider; `answer` decides each reply, `gate` lets a test hold replies back. */
function fake(answer: (r: Req) => unknown = (r) => ({ q: r.q, n: 1 })) {
  let release: () => void = () => {};
  let held: Promise<void> | null = null;
  const call = vi.fn(async (r: Req) => {
    if (held) await held;
    const body = answer(r);
    if (body instanceof Error) throw body;
    return { body, costUsd: 0.001, status: 200 };
  });
  return {
    call,
    t: { call } as unknown as Transport<Req>,
    hold() {
      held = new Promise((ok) => (release = ok));
    },
    release: () => release(),
  };
}

describe('single-flight', () => {
  it('50 identical calls at once make one provider call, and each gets its own copy', async () => {
    const p = fake();
    p.hold();
    const t = withFlight(newFlights(), POLICY)(p.t);
    const all = Promise.all(Array.from({ length: 50 }, () => t.call<{ n: number }>({ q: 'same' })));
    p.release();
    const results = await all;
    expect(p.call).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.body.n === 1)).toBe(true);
    results[1].body.n = 99; // changing one copy changes no other
    expect(results[2].body.n).toBe(1);
    expect(results.filter((r) => r.costUsd > 0)).toHaveLength(1); // only the first is charged
  });

  it('different calls are not shared, and nothing lingers after a call ends', async () => {
    const p = fake();
    const flights = newFlights();
    const t = withFlight(flights, POLICY)(p.t);
    await Promise.all([t.call({ q: 'a' }), t.call({ q: 'b' })]);
    await t.call({ q: 'a' });
    expect(p.call).toHaveBeenCalledTimes(3);
    expect(flights.size).toBe(0);
  });

  it('followers get the same error, and a lone failure is not left unhandled', async () => {
    const p = fake(() => down());
    p.hold();
    const t = withFlight(newFlights(), POLICY)(p.t);
    const a = t.call({ q: 'x' });
    const b = t.call({ q: 'x' });
    p.release();
    await expect(a).rejects.toMatchObject({ code: 'unavailable' });
    await expect(b).rejects.toMatchObject({ code: 'unavailable' });
    expect(p.call).toHaveBeenCalledTimes(1);
  });

  it('calls that are never cached are never shared', async () => {
    const p = fake();
    const t = withFlight(newFlights(), { ...POLICY, describe: () => ({ search: false, cacheKey: null, cacheTtlS: 0 }) })(p.t);
    await Promise.all([t.call({ q: 'a' }), t.call({ q: 'a' })]);
    expect(p.call).toHaveBeenCalledTimes(2);
  });
});

describe('older answers while the provider is down', () => {
  it('serves the expired answer when the provider fails, free', async () => {
    let now = 0;
    let up = true;
    const p = fake((r) => (up ? { q: r.q, v: 'fresh' } : down()));
    const onStale = vi.fn();
    const t = withCache(memoryCache(() => now), POLICY, { onStale })(p.t);
    await t.call({ q: 'x' });
    now += 61_000; // expired, still kept
    up = false;
    await expect(t.call({ q: 'x' })).resolves.toEqual({ body: { q: 'x', v: 'fresh' }, costUsd: 0, status: 200 });
    expect(onStale).toHaveBeenCalledTimes(1);
  });

  it('fails as before once the answer is too old, or when none was kept', async () => {
    let now = 0;
    let up = true;
    const p = fake((r) => (up ? { q: r.q } : down()));
    const t = withCache(memoryCache(() => now), POLICY)(p.t);
    await t.call({ q: 'x' });
    up = false;
    now += 61_000 + 3_600_000;
    await expect(t.call({ q: 'x' })).rejects.toMatchObject({ code: 'unavailable' });
    await expect(t.call({ q: 'never-seen' })).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('never stands in for real answers, or for providers that keep nothing', async () => {
    let now = 0;
    let answer: unknown = { ok: 1 };
    const p = fake(() => answer);
    const t = withCache(memoryCache(() => now), POLICY)(p.t);
    await t.call({ q: 'x' });
    now += 61_000;
    answer = new ProviderError('bad_request', 'nope', { status: 400 });
    await expect(t.call({ q: 'x' })).rejects.toMatchObject({ code: 'bad_request' });

    const q = fake(() => answer);
    const store = memoryCache(() => now);
    await store.set('p:y', { old: 1 }, 1, 3600);
    now += 2000;
    answer = down();
    await expect(withCache(store, { ...POLICY, staleS: 0 })(q.t).call({ q: 'y' })).rejects.toMatchObject({ code: 'unavailable' });
  });
});

describe('pausing a failing provider', () => {
  it('opens after repeated trouble, answers at once while open, then lets one trial through', async () => {
    let now = 0;
    let up = false;
    const p = fake(() => (up ? { ok: 1 } : down()));
    const onOpen = vi.fn();
    const breaker = createBreaker(POLICY.breaker!, () => now, onOpen);
    const t = withBreaker(breaker, POLICY)(p.t);
    for (let i = 0; i < 3; i++) await expect(t.call({ q: 'x' })).rejects.toMatchObject({ details: { reason: 'timeout' } });
    expect(breaker.state).toBe('open');
    expect(onOpen).toHaveBeenCalledTimes(1);
    await expect(t.call({ q: 'x' })).rejects.toMatchObject({ code: 'unavailable', details: { reason: 'breaker_open', retryAfterS: 30 } });
    expect(p.call).toHaveBeenCalledTimes(3); // the paused call never went out

    now += 30_000;
    up = true;
    await expect(t.call({ q: 'x' })).resolves.toMatchObject({ status: 200 });
    expect(breaker.state).toBe('closed');
  });

  it('a failed trial pauses again; only one trial goes out at a time', async () => {
    let now = 0;
    const p = fake(() => down());
    const breaker = createBreaker(POLICY.breaker!, () => now);
    const t = withBreaker(breaker, POLICY)(p.t);
    for (let i = 0; i < 3; i++) await t.call({ q: 'x' }).catch(() => {});
    now += 30_000;
    p.hold();
    const trial = t.call({ q: 'x' });
    await expect(t.call({ q: 'y' })).rejects.toMatchObject({ details: { reason: 'breaker_open' } });
    p.release();
    await expect(trial).rejects.toMatchObject({ details: { reason: 'timeout' } });
    expect(breaker.state).toBe('open');
  });

  it('failures spread out over time, real answers and our own refusals do not open it', async () => {
    let now = 0;
    let answer: unknown = down();
    const p = fake(() => answer);
    const breaker = createBreaker(POLICY.breaker!, () => now);
    const t = withBreaker(breaker, POLICY)(p.t);
    for (let i = 0; i < 5; i++) {
      await t.call({ q: 'x' }).catch(() => {});
      now += 6000; // never 3 within 10 s
    }
    answer = new ProviderError('not_found', 'x', { status: 404 });
    for (let i = 0; i < 5; i++) await t.call({ q: 'x' }).catch(() => {});
    answer = new ProviderError('busy', 'queue', { reason: 'rate_queue' });
    for (let i = 0; i < 5; i++) await t.call({ q: 'x' }).catch(() => {});
    expect(breaker.state).toBe('closed');
  });

  it('a trial stopped by our own waiting line does not leave it stuck', async () => {
    let now = 0;
    let answer: unknown = down();
    const p = fake(() => answer);
    const breaker = createBreaker(POLICY.breaker!, () => now);
    const t = withBreaker(breaker, POLICY)(p.t);
    for (let i = 0; i < 3; i++) await t.call({ q: 'x' }).catch(() => {});
    now += 30_000;
    answer = new ProviderError('busy', 'queue', { reason: 'rate_queue' });
    await t.call({ q: 'x' }).catch(() => {});
    answer = { ok: 1 };
    await expect(t.call({ q: 'x' })).resolves.toMatchObject({ status: 200 });
    expect(breaker.state).toBe('closed');
  });
});

describe('the whole gateway when a provider goes down', () => {
  it('users get the older answer quickly, and the provider is left alone while paused', async () => {
    let now = 0;
    let up = true;
    const p = fake((r) => (up ? { q: r.q } : down()));
    const deps = {
      transport: p.t,
      policy: POLICY,
      cache: memoryCache(() => now),
      spend: memorySpend(),
      slots: memorySlots(),
      limiter: createLimiter({ concurrency: 4, maxQueue: 10 }),
      flights: newFlights(),
      breaker: createBreaker(POLICY.breaker!, () => now),
      alert: () => {},
      now: () => now,
      sleep: async () => {},
    };
    const call = (q: string) => gateway(deps, newMeter()).call({ q });
    await call('a');
    now += 61_000;
    up = false;
    // the provider fails three times (the breaker opens); every user still gets the older answer
    for (let i = 0; i < 5; i++) await expect(call('a')).resolves.toMatchObject({ body: { q: 'a' }, costUsd: 0 });
    expect(p.call).toHaveBeenCalledTimes(1 + 3);
    // nothing kept for this one: a quick "unavailable" instead of a wait
    await expect(call('b')).rejects.toMatchObject({ details: { reason: 'breaker_open' } });
  });
});
