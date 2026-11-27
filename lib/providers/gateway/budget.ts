import { ProviderError } from '../errors';
import { utcDay } from './day';
import type { SpendStore } from './store/types';
import type { GatewayPolicy, Layer, SpendLimits } from './types';

/* Daily spending, per provider: refuse calls once the hard cap is reached, log
   the cost of every call, and raise an alert (once a day) past the alert level
   and again at the cap. Providers with no spend limits pass straight through. */

export type SpendAlert = { provider: string; label: string; kind: 'alert' | 'cap'; day: string; spentUsd: number; limitUsd: number; configHint: string };

export const withBudget =
  <Req>(
    store: SpendStore,
    policy: Pick<GatewayPolicy<Req>, 'provider' | 'label' | 'describe'> & { spend: SpendLimits | null },
    alert: (a: SpendAlert) => void | Promise<void>,
    now: () => number = Date.now,
  ): Layer<Req> =>
  (inner) => {
    const limits = policy.spend;
    if (!limits) return inner;
    return {
      async call<T>(req: Req) {
        const day = utcDay(now());
        if ((await store.spent(policy.provider, day)) >= limits.dailyCapUsd) {
          throw new ProviderError('budget', `Daily ${policy.label} spending cap ($${limits.dailyCapUsd}) reached.`, { provider: policy.provider, reason: 'daily_cap' });
        }
        const res = await inner.call<T>(req);
        if (res.costUsd > 0) {
          try {
            const { before, after } = await store.add(policy.provider, day, res.costUsd, policy.describe(req).search);
            for (const [kind, limitUsd] of [['alert', limits.dailyAlertUsd], ['cap', limits.dailyCapUsd]] as const) {
              if (before < limitUsd && after >= limitUsd && (await store.claimAlert(policy.provider, day, kind))) {
                await alert({ provider: policy.provider, label: policy.label, kind, day, spentUsd: after, limitUsd, configHint: limits.configHint });
              }
            }
          } catch (e) {
            console.error(`[citezeno] ${policy.provider}: could not log the call's cost`, e);
          }
        }
        return res;
      },
    };
  };
