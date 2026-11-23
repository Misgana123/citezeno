import type { CacheStore, SlotStore } from './types';

/* Use the fast store (Redis) and fall back to the backup (Postgres) when it
   fails, so a Redis outage never stops a call. After a failure the fast store
   is skipped for a short while instead of making every call wait for it to
   time out again. */

export const SKIP_AFTER_FAILURE_MS = 10_000;

export type StoreHealth = { usable(): boolean; failed(e: unknown): void };

export function storeHealth(label: string, now: () => number = Date.now, skipMs = SKIP_AFTER_FAILURE_MS): StoreHealth {
  let skipUntil = 0;
  return {
    usable: () => now() >= skipUntil,
    failed(e) {
      if (now() >= skipUntil) console.warn(`[citezeno] ${label} failed; using the backup store for ${skipMs / 1000}s:`, (e as Error)?.message ?? e);
      skipUntil = now() + skipMs;
    },
  };
}

async function firstWorking<T>(health: StoreHealth, fast: () => Promise<T>, backup: () => Promise<T>): Promise<T> {
  if (!health.usable()) return backup();
  try {
    return await fast();
  } catch (e) {
    health.failed(e);
    return backup();
  }
}

export const cacheWithFallback = (fast: CacheStore, backup: CacheStore, health: StoreHealth): CacheStore => ({
  get: (key) => firstWorking(health, () => fast.get(key), () => backup.get(key)),
  set: (key, value, ttlS) => firstWorking(health, () => fast.set(key, value, ttlS), () => backup.set(key, value, ttlS)),
});

export const slotsWithFallback = (fast: SlotStore, backup: SlotStore, health: StoreHealth): SlotStore => ({
  reserve: (key, intervalMs, maxWaitMs, now) =>
    firstWorking(
      health,
      () => fast.reserve(key, intervalMs, maxWaitMs, now),
      () => backup.reserve(key, intervalMs, maxWaitMs, now),
    ),
});
