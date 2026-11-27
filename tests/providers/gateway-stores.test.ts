import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createRedis } from '@/lib/redis';
import { cacheWithFallback, slotsWithFallback, storeHealth } from '@/lib/providers/gateway/store/fallback';
import { memoryCache, memorySlots } from '@/lib/providers/gateway/store/memory';
import { redisCache, redisSlots } from '@/lib/providers/gateway/store/redis';
import type { CacheStore, SlotStore } from '@/lib/providers/gateway/store/types';

/* The gateway's Redis stores and the fallback to Postgres. The fallback is
   tested with in-memory stores; the Redis stores need a Redis: set
   TEST_REDIS_URL (e.g. redis://localhost:6379) to run them. */

const broken = (): CacheStore & SlotStore => ({
  get: vi.fn(async () => {
    throw new Error('redis down');
  }),
  getStale: vi.fn(async () => {
    throw new Error('redis down');
  }),
  set: vi.fn(async () => {
    throw new Error('redis down');
  }),
  reserve: vi.fn(async () => {
    throw new Error('redis down');
  }),
});

describe('store fallback', () => {
  it('uses the fast store while it works', async () => {
    const fast = memoryCache();
    const backup = memoryCache();
    const cache = cacheWithFallback(fast, backup, storeHealth('test'));
    await cache.set('k', { a: 1 }, 60);
    expect(await fast.get('k')).toEqual({ a: 1 });
    expect(await backup.get('k')).toBeNull();
    expect(await cache.get('k')).toEqual({ a: 1 });
  });

  it('falls back when the fast store fails, then skips it for a while', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let now = 1000;
    const fast = broken();
    const backup = memoryCache();
    const cache = cacheWithFallback(fast, backup, storeHealth('test', () => now, 10_000));
    await cache.set('k', 'v', 60);
    expect(await backup.get('k')).toBe('v');
    expect(await cache.get('k')).toBe('v');
    expect(fast.get).not.toHaveBeenCalled(); // skipped after the failed set
    now += 10_000;
    await cache.get('k');
    expect(fast.get).toHaveBeenCalledTimes(1); // tried again after the pause
  });

  it('slots fall back too', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const slots = slotsWithFallback(broken(), memorySlots(), storeHealth('test'));
    expect(await slots.reserve('openalex:any', 100, 1000, 5000)).toBe(0);
    expect(await slots.reserve('openalex:any', 100, 1000, 5000)).toBe(100);
  });
});

describe('redis unreachable', () => {
  it('falls back to the backup store within the command timeout', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = createRedis('redis://127.0.0.1:1'); // nothing listens there
    try {
      const backup = memoryCache();
      await backup.set('k', 'from backup', 60);
      const cache = cacheWithFallback(redisCache(client), backup, storeHealth('test'));
      const start = Date.now();
      expect(await cache.get('k')).toBe('from backup');
      expect(Date.now() - start).toBeLessThan(2000);
    } finally {
      client.disconnect();
    }
  });
});

const REDIS_URL = process.env.TEST_REDIS_URL?.trim() || '';

describe.skipIf(!REDIS_URL)('redis stores', () => {
  const client = REDIS_URL ? createRedis(REDIS_URL) : null!;
  const prefix = `cztest:${randomUUID().slice(0, 8)}:`;

  afterAll(async () => {
    const keys = await client.keys(`${prefix}*`);
    if (keys.length) await client.del(...keys);
    client.disconnect();
  });

  it('caches JSON values with a time limit', async () => {
    const cache = redisCache(client, prefix);
    expect(await cache.get('openalex:x')).toBeNull();
    await cache.set('openalex:x', { results: [1, 2], meta: { count: 2 } }, 60);
    expect(await cache.get('openalex:x')).toEqual({ results: [1, 2], meta: { count: 2 } });
    expect(await client.ttl(`${prefix}cache:openalex:x`)).toBeGreaterThan(50);
  });

  it('keeps an expired entry as stale until its stale time is over', async () => {
    let now = Date.now();
    const cache = redisCache(client, prefix, () => now);
    await cache.set('openalex:s', { v: 1 }, 60, 3600);
    now += 61_000;
    expect(await cache.get('openalex:s')).toBeNull();
    expect(await cache.getStale('openalex:s')).toEqual({ v: 1 });
    expect(await client.ttl(`${prefix}cache:openalex:s`)).toBeGreaterThan(3600);
    await client.set(`${prefix}cache:openalex:raw`, JSON.stringify({ not: 'ours' }));
    expect(await cache.getStale('openalex:raw')).toBeNull();
  });

  it('hands out slots one interval apart and refuses past the wait limit', async () => {
    const slots = redisSlots(client, prefix);
    const now = Date.now();
    expect(await slots.reserve('openalex:semantic', 1000, 2500, now)).toBe(0);
    expect(await slots.reserve('openalex:semantic', 1000, 2500, now)).toBe(1000);
    expect(await slots.reserve('openalex:semantic', 1000, 2500, now)).toBe(2000);
    expect(await slots.reserve('openalex:semantic', 1000, 2500, now)).toBeNull();
    // later on, the queue has moved
    expect(await slots.reserve('openalex:semantic', 1000, 2500, now + 3000)).toBe(0);
  });

  it('keeps slots exact when many callers reserve at once', async () => {
    const slots = redisSlots(client, prefix);
    const now = Date.now();
    const waits = await Promise.all(Array.from({ length: 20 }, () => slots.reserve('openalex:burst', 100, 10_000, now)));
    expect(waits.map(Number).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i * 100));
  });
});
