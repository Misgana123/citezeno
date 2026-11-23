import type { GatewayPolicy, Layer, ProviderResponse } from './types';

/* Single-flight: when the same cacheable call is already on its way to the
   provider in this server instance, later callers wait for that answer instead
   of making the call again. 50 people searching the same words at once cost one
   call. Followers get their own copy of the answer, free (like a cache hit), so
   only the first caller's request is metered. Across instances, the shared
   cache does the same job a moment later. */

export type Flights = Map<string, Promise<ProviderResponse<unknown>>>;

export const newFlights = (): Flights => new Map();

export const withFlight =
  <Req>(flights: Flights, policy: Pick<GatewayPolicy<Req>, 'provider' | 'describe'>, onShared?: () => void): Layer<Req> =>
  (inner) => ({
    async call<T>(req: Req) {
      const info = policy.describe(req);
      if (info.cacheKey == null) return inner.call<T>(req);
      const key = `${policy.provider}:${info.cacheKey}`;
      const pending = flights.get(key) as Promise<ProviderResponse<T>> | undefined;
      if (pending) {
        onShared?.();
        const res = await pending;
        return { body: structuredClone(res.body), costUsd: 0, status: res.status };
      }
      const call = inner.call<T>(req);
      // a snapshot taken the moment the answer arrives, before the first caller can change it
      const shared = call.then((r) => ({ ...r, body: structuredClone(r.body) }));
      shared.catch(() => {}); // followers see the error; with none, it isn't "unhandled"
      flights.set(key, shared);
      try {
        return await call;
      } finally {
        flights.delete(key);
      }
    },
  });
