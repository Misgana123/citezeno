/* The per-user daily search count. It has a Postgres version (store/pg.ts) and
   an in-memory version (store/memory.ts) for tests and local runs. The stores
   the gateway needs (cache, spending, slots) live in lib/providers/gateway/store. */

/* Searches each user ran each UTC day. */
export interface UsageStore {
  /* Reserve n searches if that stays within the limit; returns the new count, or null if it would not. */
  reserve(userId: string, day: string, n: number, limit: number): Promise<number | null>;
  refund(userId: string, day: string, n: number): Promise<void>;
  used(userId: string, day: string): Promise<number>;
}
