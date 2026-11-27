import { ProviderError } from '../errors';
import { sleep as realSleep, type Sleep } from './pacer';
import type { SlotStore } from './store/types';
import type { GatewayPolicy, Layer } from './types';

/* The provider's overall speed limit (say, 10 calls a second per key), shared
   by every server instance through the slot store. This is the waiting line:
   each call takes the next free turn and waits for it, so a burst becomes a
   short wait instead of errors from the provider. Only when the next free turn
   is further off than `maxWaitMs` does the caller get "busy". Providers
   without a `rate` pass straight through. */

export const RATE_KEY = 'all';

export const intervalFor = (perSecond: number) => Math.ceil(1000 / perSecond);

export const withRate =
  <Req>(slots: SlotStore, policy: Pick<GatewayPolicy<Req>, 'provider' | 'label' | 'rate'>, opts: { now?: () => number; sleep?: Sleep; onWait?: (ms: number) => void } = {}): Layer<Req> =>
  (inner) => {
    const rate = policy.rate;
    if (!rate || !(rate.perSecond > 0)) return inner;
    const interval = intervalFor(rate.perSecond);
    return {
      async call<T>(req: Req) {
        const wait = await slots.reserve(`${policy.provider}:${RATE_KEY}`, interval, rate.maxWaitMs, (opts.now ?? Date.now)());
        if (wait == null) {
          throw new ProviderError('busy', `${policy.label} is busy: too many calls waiting.`, { provider: policy.provider, reason: 'rate_queue', retryAfterS: Math.ceil(rate.maxWaitMs / 1000) });
        }
        if (wait > 0) {
          opts.onWait?.(wait);
          await (opts.sleep ?? realSleep)(wait);
        }
        return inner.call<T>(req);
      },
    };
  };
