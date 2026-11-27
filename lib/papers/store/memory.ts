import type { UsageStore } from './types';

/* An in-memory usage store: for tests, and for local runs without a database.
   It holds for one server process only. */
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
