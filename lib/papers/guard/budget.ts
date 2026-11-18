import type { PapersConfig } from '../config';
import { PapersError } from '../errors';
import type { QueryParams } from '../openalex/client';
import type { SpendStore } from '../store/types';
import { callKind, isSearch, type Layer } from './call';
import { utcDay } from './day';

/* Daily OpenAlex spending: refuse calls once the hard cap is reached, log the
   cost of every call, and raise an alert (once a day) past the alert level
   and again at the cap. */

export type SpendAlert = { kind: 'alert' | 'cap'; day: string; spentUsd: number; limitUsd: number };

export const withBudget =
  (
    store: SpendStore,
    config: Pick<PapersConfig, 'dailyAlertUsd' | 'dailyCapUsd'>,
    alert: (a: SpendAlert) => void | Promise<void>,
    now: () => number = Date.now,
  ): Layer =>
  (inner) => ({
    async get<T>(path: string, params: QueryParams = {}) {
      const day = utcDay(now());
      if ((await store.spent(day)) >= config.dailyCapUsd) {
        throw new PapersError('budget', `Daily OpenAlex spending cap ($${config.dailyCapUsd}) reached.`, { reason: 'daily_cap' });
      }
      const res = await inner.get<T>(path, params);
      if (res.costUsd > 0) {
        try {
          const { before, after } = await store.add(day, res.costUsd, isSearch(callKind(path, params)));
          for (const [kind, limitUsd] of [['alert', config.dailyAlertUsd], ['cap', config.dailyCapUsd]] as const) {
            if (before < limitUsd && after >= limitUsd && (await store.claimAlert(day, kind))) await alert({ kind, day, spentUsd: after, limitUsd });
          }
        } catch (e) {
          console.error('[citezeno] papers: could not log OpenAlex cost', e);
        }
      }
      return res;
    },
  });
