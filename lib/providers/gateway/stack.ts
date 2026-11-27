import { withBreaker, type Breaker } from './breaker';
import { withBudget, type SpendAlert } from './budget';
import { withCache } from './cache';
import { withDailyCalls } from './calls';
import { withFlight, type Flights } from './flight';
import type { Limiter } from './limiter';
import { withLimiter } from './limiter';
import { withMeter, type Meter } from './meter';
import { withPacing, type Sleep } from './pacer';
import { withRate } from './rate';
import { withRetry } from './retry';
import { noStats, withCallStats, withRefusalStats, type Stats } from './stats';
import type { CacheStore, SlotStore, SpendStore } from './store/types';
import type { GatewayPolicy, Layer, Transport } from './types';

/* The gateway: every call to an outside provider goes through, in order:

     cache  → a hit returns at once (free, not counted); when the provider
              fails, an expired answer still kept stands in for it
     flight → the same call already on its way shares that answer
     meter  → counts what really reaches the provider for this request
     budget → refuses past the provider's daily spending (or call) cap; logs cost; alerts
     breaker → a provider that keeps failing is paused for a moment
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
  /* Calls on their way, shared by every request in this instance. */
  flights?: Flights;
  /* This provider's breaker in this instance, when its policy asks for one. */
  breaker?: Breaker | null;
  /* Counts for the admin page (default: not counted). */
  stats?: Stats;
  alert: (a: SpendAlert) => void | Promise<void>;
  now?: () => number;
  sleep?: Sleep;
};

export const compose = <Req>(base: Transport<Req>, ...layers: Layer<Req>[]): Transport<Req> => layers.reduceRight((t, layer) => layer(t), base);

const pass: Layer<never> = (inner) => inner;
const skip = <Req>() => pass as Layer<Req>;

export function gateway<Req>(d: GatewayDeps<Req>, meter: Meter): Transport<Req> {
  const stats = d.stats ?? noStats;
  const count = (name: Parameters<Stats['add']>[1]) => () => stats.add(d.policy.provider, name);
  const waited = (ms: number) => stats.add(d.policy.provider, 'waited', ms);
  return compose(
    d.transport,
    withCache(d.cache, d.policy, { onHit: count('cache_hit'), onMiss: count('cache_miss'), onStale: count('cache_stale') }),
    d.flights ? withFlight(d.flights, d.policy, count('shared')) : skip<Req>(),
    withMeter(meter, d.policy),
    withRefusalStats(stats, d.policy),
    withBudget(d.spend, d.policy, d.alert, d.now),
    withDailyCalls(d.spend, d.policy, d.now),
    d.breaker ? withBreaker(d.breaker, d.policy) : skip<Req>(),
    withRetry({ tries: d.policy.retryTries, transientTries: d.policy.retryTransient, sleep: d.sleep }),
    withRate(d.slots, d.policy, { now: d.now, sleep: d.sleep, onWait: waited }),
    withPacing(d.slots, d.policy, { now: d.now, sleep: d.sleep, onWait: waited }),
    withLimiter(d.limiter),
    withCallStats(stats, d.policy, d.now),
  );
}
