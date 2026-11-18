/* Storage the guard layers need. Each has a Postgres version (store/pg.ts)
   and an in-memory version (store/memory.ts) for tests and local runs. */

/* Cached OpenAlex responses. */
export interface CacheStore {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown, ttlS: number): Promise<void>;
}

/* What Find Papers spent on OpenAlex each UTC day. No queries, no users: just totals. */
export interface SpendStore {
  spent(day: string): Promise<number>;
  /* Add one call's cost; returns the day's total before and after. */
  add(day: string, usd: number, search: boolean): Promise<{ before: number; after: number }>;
  /* True only for the first caller each day, so an alert goes out once. */
  claimAlert(day: string, kind: 'alert' | 'cap'): Promise<boolean>;
}

/* Searches each user ran each UTC day. */
export interface UsageStore {
  /* Reserve n searches if that stays within the limit; returns the new count, or null if it would not. */
  reserve(userId: string, day: string, n: number, limit: number): Promise<number | null>;
  refund(userId: string, day: string, n: number): Promise<void>;
  used(userId: string, day: string): Promise<number>;
}

/* Shared call slots, so a per-second limit holds across server instances.
   Reserves the next free slot at most maxWaitMs away; returns how long to
   wait for it, or null when the queue is too long. */
export interface SlotStore {
  reserve(key: string, intervalMs: number, maxWaitMs: number, now: number): Promise<number | null>;
}
