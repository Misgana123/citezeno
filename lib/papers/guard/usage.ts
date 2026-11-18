import { PapersError } from '../errors';
import type { UsageStore } from '../store/types';
import { nextUtcMidnight, utcDay } from './day';

/* Each signed-in user's daily search limit (PAPERS_DAILY_SEARCHES).
   A request reserves the searches it may run before it starts, and gives back
   what it didn't use afterwards (cache hits, failures), so concurrent
   requests can't slip past the limit. */

export type Reservation = { reserved: number; settle(used: number): Promise<void> };

export async function reserveSearches(
  store: UsageStore,
  userId: string,
  n: number,
  limit: number,
  now: number = Date.now(),
): Promise<Reservation> {
  const day = utcDay(now);
  if (n <= 0) return { reserved: 0, settle: async () => {} };
  const count = await store.reserve(userId, day, n, limit);
  if (count == null) {
    throw new PapersError('user_limit', 'Daily search limit reached.', { resetsAt: nextUtcMidnight(now).toISOString(), limit });
  }
  return {
    reserved: n,
    async settle(used) {
      const unused = n - Math.max(0, used);
      if (unused > 0) await store.refund(userId, day, unused).catch((e) => console.warn('[citezeno] papers: refund failed', e));
    },
  };
}
