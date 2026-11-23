import { withBudget, type SpendAlert } from './budget';
import { withCache } from './cache';
import type { Limiter } from './limiter';
import { withLimiter } from './limiter';
import { withMeter, type Meter } from './meter';
import { withPacing, type Sleep } from './pacer';
import { withRate } from './rate';
import { withRetry } from './retry';
import type { CacheStore, SlotStore, SpendStore } from './store/types';
import type { GatewayPolicy, Layer, Transport } from './types';

/* The gateway: every call to an outside provider goes through, in order:

     cache  → a hit returns at once (free, not counted)
     meter  → counts what really reaches the provider for this request
     budget → refuses past the provider's daily cap; logs cost; alerts
     retry  → per-second 429s (and, if the provider allows, hiccups) are tried again
     rate   → the provider's shared waiting line: each call waits its turn
     pace   → calls with a shared per-kind slot (OpenAlex semantic) wait for it
     limit  → at most so many calls in flight per instance; "busy" when full
     transport → the adapter's raw call

   Waiting for a turn happens before a call takes one of the instance's
   in-flight places, so waiting callers never hold them up.

   The same layers serve every provider; what differs comes from its policy. */

export type GatewayDeps<Req> = {
  transport: Transport<Req>;
  policy: GatewayPolicy<Req>;
  cache: CacheStore;
  spend: SpendStore;
  slots: SlotStore;
  limiter: Limiter;
  alert: (a: SpendAlert) => void | Promise<void>;
  now?: () => number;
  sleep?: Sleep;
};

export const compose = <Req>(base: Transport<Req>, ...layers: Layer<Req>[]): Transport<Req> => layers.reduceRight((t, layer) => layer(t), base);

export function gateway<Req>(d: GatewayDeps<Req>, meter: Meter): Transport<Req> {
  return compose(
    d.transport,
    withCache(d.cache, d.policy),
    withMeter(meter, d.policy),
    withBudget(d.spend, d.policy, d.alert, d.now),
    withRetry({ tries: d.policy.retryTries, transientTries: d.policy.retryTransient, sleep: d.sleep }),
    withRate(d.slots, d.policy, { now: d.now, sleep: d.sleep }),
    withPacing(d.slots, d.policy, { now: d.now, sleep: d.sleep }),
    withLimiter(d.limiter),
  );
}
