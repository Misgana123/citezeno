import type { GatewayPolicy, Layer } from './types';

/* Counts, for one user request, the searches, calls and cost that actually
   reached a provider (cache hits are free and not counted). One meter can be
   shared by every provider a request uses. Used to settle the user's daily
   search limit after the request. */

export type Meter = { searches: number; costUsd: number; calls: number };

export const newMeter = (): Meter => ({ searches: 0, costUsd: 0, calls: 0 });

export const withMeter =
  <Req>(meter: Meter, policy: Pick<GatewayPolicy<Req>, 'describe'>): Layer<Req> =>
  (inner) => ({
    async call<T>(req: Req) {
      const res = await inner.call<T>(req);
      meter.calls++;
      meter.costUsd += res.costUsd;
      if (policy.describe(req).search) meter.searches++;
      return res;
    },
  });
