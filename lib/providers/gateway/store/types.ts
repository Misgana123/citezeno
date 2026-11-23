/* Storage the gateway layers need. Each has a Postgres version (pg.ts) and an
   in-memory version (memory.ts) for tests and local runs. */

/* Cached provider responses. Keys already carry the provider's name. An entry
   is fresh for ttlS seconds, then kept staleS more as a stand-in for when the
   provider is down or busy. */
export interface CacheStore {
  /* A fresh entry, or null. */
  get(key: string): Promise<unknown | null>;
  /* An entry that is fresh or still kept as stale, or null. */
  getStale(key: string): Promise<unknown | null>;
  set(key: string, value: unknown, ttlS: number, staleS?: number): Promise<void>;
}

/* What each provider cost each UTC day. No queries, no users: just totals. */
export interface SpendStore {
  spent(provider: string, day: string): Promise<number>;
  /* Add one call's cost; returns the day's total before and after. */
  add(provider: string, day: string, usd: number, search: boolean): Promise<{ before: number; after: number }>;
  /* True only for the first caller each day, so an alert goes out once. */
  claimAlert(provider: string, day: string, kind: 'alert' | 'cap'): Promise<boolean>;
}

/* Shared call slots, so a per-second limit holds across server instances.
   Reserves the next free slot at most maxWaitMs away; returns how long to
   wait for it, or null when the queue is too long. */
export interface SlotStore {
  reserve(key: string, intervalMs: number, maxWaitMs: number, now: number): Promise<number | null>;
}
