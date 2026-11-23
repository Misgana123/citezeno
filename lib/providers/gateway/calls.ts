import { ProviderError } from '../errors';
import { nextUtcMidnight, utcDay } from './day';
import type { SpendStore } from './store/types';
import type { GatewayPolicy, Layer } from './types';

/* A daily call cap, for free providers that allow only so many calls a day
   (Unpaywall: 100,000). Every call that succeeds is logged in the provider's
   daily totals; once the cap is reached, calls are refused until midnight UTC
   and a warning is logged once. Providers without one pass straight through.
   (Paid providers are capped by spending instead: budget.ts.) */

export const withDailyCalls =
  <Req>(store: SpendStore, policy: Pick<GatewayPolicy<Req>, 'provider' | 'label' | 'describe' | 'dailyCalls'>, now: () => number = Date.now): Layer<Req> =>
  (inner) => {
    const cap = policy.dailyCalls;
    if (!cap) return inner;
    return {
      async call<T>(req: Req) {
        const day = utcDay(now());
        if ((await store.calls(policy.provider, day)) >= cap.cap) {
          const retryAfterS = Math.ceil((nextUtcMidnight(now()).getTime() - now()) / 1000);
          throw new ProviderError('budget', `Daily ${policy.label} call cap (${cap.cap}) reached.`, { provider: policy.provider, reason: 'daily_calls', retryAfterS });
        }
        const res = await inner.call<T>(req);
        try {
          await store.add(policy.provider, day, 0, policy.describe(req).search);
          if ((await store.calls(policy.provider, day)) >= cap.cap && (await store.claimAlert(policy.provider, day, 'cap'))) {
            console.warn(`[citezeno] ${policy.provider}: ${policy.label} reached its daily call cap (${cap.cap}); calls pause until midnight UTC. Change it with ${cap.configHint}.`);
          }
        } catch (e) {
          console.error(`[citezeno] ${policy.provider}: could not log the call`, e);
        }
        return res;
      },
    };
  };
