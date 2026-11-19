import type { CacheStore } from './store/types';
import type { GatewayPolicy, Layer, ProviderResponse } from './types';

/* Caches responses by the key the adapter's policy gives each call (null: not
   cached). Stored keys start with the provider's name, so two providers never
   share an entry. A cache outage never stops a call. */
export const withCache =
  <Req>(store: CacheStore, policy: Pick<GatewayPolicy<Req>, 'provider' | 'describe'>, onHit?: () => void): Layer<Req> =>
  (inner) => ({
    async call<T>(req: Req) {
      const info = policy.describe(req);
      if (info.cacheKey == null || info.cacheTtlS <= 0) return inner.call<T>(req);
      const key = `${policy.provider}:${info.cacheKey}`;
      const hit = await store.get(key).catch(() => null);
      if (hit != null) {
        onHit?.();
        return { body: hit as T, costUsd: 0, status: 200 } satisfies ProviderResponse<T>;
      }
      const res = await inner.call<T>(req);
      await store.set(key, res.body, info.cacheTtlS).catch((e) => console.warn(`[citezeno] ${policy.provider}: cache write failed`, e));
      return res;
    },
  });
