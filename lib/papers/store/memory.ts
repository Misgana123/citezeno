import type { CacheStore, SlotStore, SpendStore, UsageStore } from './types';

/* In-memory stores: for tests, and for local runs without a database.
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
  return {
    async spent(day) {
      return days.get(day) ?? 0;
    },
    async add(day, usd) {
      const before = days.get(day) ?? 0;
      days.set(day, before + usd);
      return { before, after: before + usd };
    },
    async claimAlert(day, kind) {
      const k = `${day}:${kind}`;
      if (claimed.has(k)) return false;
      claimed.add(k);
      return true;
    },
  };
}

export function memoryUsage(): UsageStore {
  const counts = new Map<string, number>();
  const key = (u: string, d: string) => `${u}:${d}`;
  return {
    async reserve(userId, day, n, limit) {
      const next = (counts.get(key(userId, day)) ?? 0) + n;
      if (next > limit) return null;
      counts.set(key(userId, day), next);
      return next;
    },
    async refund(userId, day, n) {
      counts.set(key(userId, day), Math.max(0, (counts.get(key(userId, day)) ?? 0) - n));
    },
    async used(userId, day) {
      return counts.get(key(userId, day)) ?? 0;
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
