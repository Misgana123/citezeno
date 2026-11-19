import type { CacheStore, SlotStore, SpendStore } from './types';

/* In-memory gateway stores: for tests, and for local runs without a database.
   They hold for one server process only. */

export function memoryCache(now: () => number = Date.now): CacheStore {
  const items = new Map<string, { value: unknown; expires: number }>();
  return {
    async get(key) {
      const hit = items.get(key);
      if (!hit) return null;
      if (hit.expires <= now()) {
        items.delete(key);
        return null;
      }
      return structuredClone(hit.value);
    },
    async set(key, value, ttlS) {
      items.set(key, { value: structuredClone(value), expires: now() + ttlS * 1000 });
    },
  };
}

export function memorySpend(): SpendStore {
  const days = new Map<string, number>();
  const claimed = new Set<string>();
  const k = (provider: string, day: string) => `${provider}:${day}`;
  return {
    async spent(provider, day) {
      return days.get(k(provider, day)) ?? 0;
    },
    async add(provider, day, usd) {
      const before = days.get(k(provider, day)) ?? 0;
      days.set(k(provider, day), before + usd);
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
