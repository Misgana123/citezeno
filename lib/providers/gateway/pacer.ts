import { ProviderError } from '../errors';
import type { SlotStore } from './store/types';
import type { GatewayPolicy, Layer } from './types';

/* Some providers allow only so many calls of a kind per second per key, across
   all our users and server instances (OpenAlex: one semantic search a second).
   Such a call reserves the next shared slot and waits for it; when the next
   free slot is too far off, the user gets "busy" instead of a long wait. */

export type Sleep = (ms: number) => Promise<void>;
export const sleep: Sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

export const withPacing =
  <Req>(slots: SlotStore, policy: Pick<GatewayPolicy<Req>, 'provider' | 'describe'>, opts: { now?: () => number; sleep?: Sleep; onWait?: (ms: number) => void } = {}): Layer<Req> =>
  (inner) => ({
    async call<T>(req: Req) {
      const pace = policy.describe(req).pace;
      if (pace) {
        const wait = await slots.reserve(`${policy.provider}:${pace.key}`, pace.intervalMs, pace.maxWaitMs, (opts.now ?? Date.now)());
        if (wait == null) throw new ProviderError('busy', `Too many ${pace.key} calls queued.`, { provider: policy.provider, reason: `${pace.key}_queue` });
        if (wait > 0) {
          opts.onWait?.(wait);
          await (opts.sleep ?? sleep)(wait);
        }
      }
      return inner.call<T>(req);
    },
  });
