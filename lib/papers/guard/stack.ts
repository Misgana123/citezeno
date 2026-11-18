import type { PapersConfig } from '../config';
import type { OpenAlexClient } from '../openalex/client';
import type { CacheStore, SlotStore, SpendStore } from '../store/types';
import type { SpendAlert } from './budget';
import { withBudget } from './budget';
import { withCache } from './cache';
import { compose } from './call';
import { withLimiter, type Limiter } from './limiter';
import { withMeter, type Meter } from './meter';
import { withPacing, type Sleep } from './pacer';
import { withRetry } from './retry';

/* Every OpenAlex call from Find Papers goes through, in order:

     cache  → a hit returns at once (free, not counted)
     meter  → counts what really reaches OpenAlex for this request
     budget → refuses past the daily cap; logs cost; alerts
     limit  → in-process queue; "busy" when full
     retry  → per-second 429s are retried with backoff
     pace   → semantic calls take a shared 1-per-second slot
     client → the HTTP call */

export type GuardDeps = {
  client: OpenAlexClient;
  config: PapersConfig;
  cache: CacheStore;
  spend: SpendStore;
  slots: SlotStore;
  limiter: Limiter;
  alert: (a: SpendAlert) => void | Promise<void>;
  now?: () => number;
  sleep?: Sleep;
};

export function guardedClient(d: GuardDeps, meter: Meter): OpenAlexClient {
  return compose(
    d.client,
    withCache(d.cache, d.config),
    withMeter(meter),
    withBudget(d.spend, d.config, d.alert, d.now),
    withLimiter(d.limiter),
    withRetry({ sleep: d.sleep }),
    withPacing(d.slots, { now: d.now, sleep: d.sleep }),
  );
}
