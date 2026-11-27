import { reserveSearches, type Reservation } from '@/lib/papers/guard/usage';
import type { UsageStore } from '@/lib/papers/store/types';

/* The user's daily search limit across one agent reply, which may search
   several times. Each search is reserved before it runs; when the reply ends,
   searches that didn't reach the paper provider (cache hits, failures) are
   given back, exactly as for a Find Papers request. */
export function searchReservations(usage: UsageStore, userId: string, limit: number) {
  const held: Reservation[] = [];
  return {
    async reserve(n: number) {
      held.push(await reserveSearches(usage, userId, n, limit));
    },
    /* `used`: searches that really ran (the request's meter). */
    async settle(used: number) {
      let left = Math.max(0, used);
      for (const r of held) {
        const take = Math.min(r.reserved, left);
        left -= take;
        await r.settle(take);
      }
      held.length = 0;
    },
  };
}
