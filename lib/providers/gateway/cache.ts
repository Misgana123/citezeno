import { isProviderError } from '../errors';
import type { CacheStore } from './store/types';
import type { GatewayPolicy, Layer, ProviderResponse } from './types';

/* Caches responses by the key the adapter's policy gives each call (null: not
   cached). Stored keys start with the provider's name, so two providers never
   share an entry. A cache outage never stops a call.

   Providers with `staleS` keep each entry that much longer after it expires:
   when the provider is busy, down or out of budget, the expired answer is
   served instead of an error (an older answer beats none). */

export type CacheEvents = { onHit?(): void; onMiss?(): void; onStale?(): void };

/* Failures an older answer can stand in for. Bad requests and "not found" are real answers. */
const standIn = (e: unknown) => isProviderError(e) && (e.code === 'busy' || e.code === 'unavailable' || e.code === 'budget');

export const withCache =
  <Req>(store: CacheStore, policy: Pick<GatewayPolicy<Req>, 'provider' | 'describe' | 'staleS'>, events: CacheEvents = {}): Layer<Req> =>
  (inner) => ({
    async call<T>(req: Req) {
      const info = policy.describe(req);
      if (info.cacheKey == null || info.cacheTtlS <= 0) return inner.call<T>(req);
      const key = `${policy.provider}:${info.cacheKey}`;
      const hit = await store.get(key).catch(() => null);
      if (hit != null) {
        events.onHit?.();
        return { body: hit as T, costUsd: 0, status: 200 } satisfies ProviderResponse<T>;
      }
      events.onMiss?.();
      const staleS = policy.staleS ?? 0;
      let res: ProviderResponse<T>;
      try {
        res = await inner.call<T>(req);
      } catch (e) {
        if (staleS > 0 && standIn(e)) {
          const old = await store.getStale(key).catch(() => null);
          if (old != null) {
            events.onStale?.();
            return { body: old as T, costUsd: 0, status: 200 };
          }
        }
        throw e;
      }
      await store.set(key, res.body, info.cacheTtlS, staleS).catch((e) => console.warn(`[citezeno] ${policy.provider}: cache write failed`, e));
      return res;
    },
  });
