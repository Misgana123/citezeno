import type { CacheStore, SlotStore, SpendStore } from './types';

/* In-memory gateway stores: for tests, and for local runs without a database.
   They hold for one server process only. */

export function memoryCache(now: () => number = Date.now): CacheStore {
  const items = new Map<string, { value: unknown; expires: number; staleUntil: number }>();
  const kept = (key: string) => {
    const hit = items.get(key);
    if (hit && hit.staleUntil <= now()) items.delete(key);
    return hit && hit.staleUntil > now() ? hit : null;
  };
  return {
    async get(key) {
      const hit = kept(key);
      return hit && hit.expires > now() ? structuredClone(hit.value) : null;
    },
    async getStale(key) {
      const hit = kept(key);
      return hit ? structuredClone(hit.value) : null;
    },
    async set(key, value, ttlS, staleS = 0) {
      const expires = now() + ttlS * 1000;
      items.set(key, { value: structuredClone(value), expires, staleUntil: expires + Math.max(0, staleS) * 1000 });
    },
  };
}

export function memorySpend(): SpendStore {
  const days = new Map<string, number>();
  const calls = new Map<string, number>();
  const claimed = new Set<string>();
  const k = (provider: string, day: string) => `${provider}:${day}`;
  return {
    async spent(provider, day) {
      return days.get(k(provider, day)) ?? 0;
    },
    async calls(provider, day) {
      return calls.get(k(provider, day)) ?? 0;
    },
    async add(provider, day, usd) {
      const before = days.get(k(provider, day)) ?? 0;
      days.set(k(provider, day), before + usd);
      calls.set(k(provider, day), (calls.get(k(provider, day)) ?? 0) + 1);
      return { before, after: before + usd };
    },
    async claimAlert(provider, day, kind) {
      const key = `${k(provider, day)}:${kind}`;
      if (claimed.has(key)) return false;
      claimed.add(key);
      return true;
    },
  };
}

export function memorySlots(): SlotStore {
  const next = new Map<string, number>();
  return {
    async reserve(key, intervalMs, maxWaitMs, now) {
      const slot = Math.max(next.get(key) ?? 0, now);
      if (slot - now > maxWaitMs) return null;
      next.set(key, slot + intervalMs);
      return slot - now;
    },
  };
}
