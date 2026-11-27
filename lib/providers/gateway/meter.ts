import type { GatewayPolicy, Layer } from './types';

/* Counts, for one user request, the searches, calls and cost that actually
   reached a provider (cache hits are free and not counted). One meter can be
   shared by every provider a request uses. Used to settle the user's daily
   search limit after the request, and — when `credits` is set — to charge the
   request's credits: each call that reaches a provider reserves its estimated
   cost first (it fails without calling when that can't be covered) and records
   its real cost after. */

export type CallCredits = {
  before(provider: string, estimateUsd: number): Promise<void>;
  after(call: { provider: string; label: string; costUsd: number; ok: boolean; reservedUsd: number }): Promise<void>;
};

export type Meter = { searches: number; costUsd: number; calls: number; credits?: CallCredits };

export const newMeter = (credits?: CallCredits): Meter => ({ searches: 0, costUsd: 0, calls: 0, ...(credits ? { credits } : {}) });

export const withMeter =
  <Req>(meter: Meter, policy: Pick<GatewayPolicy<Req>, 'describe' | 'provider' | 'label' | 'estimateUsd'>): Layer<Req> =>
  (inner) => ({
    async call<T>(req: Req) {
      const credits = meter.credits;
      const reservedUsd = credits ? Math.max(0, policy.estimateUsd?.(req) ?? 0) : 0;
      if (credits) await credits.before(policy.provider, reservedUsd);
      let res;
      try {
        res = await inner.call<T>(req);
      } catch (e) {
        await credits?.after({ provider: policy.provider, label: policy.label, costUsd: 0, ok: false, reservedUsd });
        throw e;
      }
      meter.calls++;
      meter.costUsd += res.costUsd;
      if (policy.describe(req).search) meter.searches++;
      await credits?.after({ provider: policy.provider, label: policy.label, costUsd: res.costUsd, ok: true, reservedUsd });
      return res;
    },
  });
