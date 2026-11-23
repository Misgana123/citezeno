import { isProviderError, ProviderError } from '../errors';
import type { GatewayPolicy, Layer } from './types';

/* A circuit breaker per provider, in this server instance: after `failures`
   failures within `windowMs` (timeouts, failed connections, 5xx answers), stop
   calling the provider for `cooldownMs` and answer "unavailable" at once, so
   users don't each wait for a timeout (the cache then serves an older answer
   when it has one). After the pause one trial call goes through: if it works,
   calls flow again; if not, another pause. Our own refusals (busy, budget) and
   real answers (bad request, not found) don't count. */

export type BreakerSettings = { failures: number; windowMs: number; cooldownMs: number };

export type BreakerState = 'closed' | 'open' | 'trial';

export type Breaker = {
  readonly state: BreakerState;
  /* May a call go out now? Claims the trial call when the pause is over. */
  allow(): boolean;
  succeeded(): void;
  failed(): void;
  /* The trial call never reached the provider (say, our own waiting line was full): let the next call try. */
  release(): void;
};

export function createBreaker(s: BreakerSettings, now: () => number = Date.now, onOpen?: () => void): Breaker {
  let state: BreakerState = 'closed';
  let failures: number[] = [];
  let openUntil = 0;
  let trialOut = false;

  const open = () => {
    state = 'open';
    openUntil = now() + s.cooldownMs;
    failures = [];
    trialOut = false;
    onOpen?.();
  };

  return {
    get state() {
      return state;
    },
    allow() {
      if (state === 'closed') return true;
      if (state === 'open' && now() >= openUntil) state = 'trial';
      if (state === 'trial' && !trialOut) {
        trialOut = true;
        return true;
      }
      return false;
    },
    succeeded() {
      state = 'closed';
      failures = [];
      trialOut = false;
    },
    failed() {
      if (state === 'trial') return open();
      const t = now();
      failures = [...failures.filter((f) => t - f < s.windowMs), t];
      if (failures.length >= s.failures) open();
    },
    release() {
      trialOut = false;
    },
  };
}

/* The failures that say the provider itself is in trouble. */
export const providerTrouble = (e: unknown) => isProviderError(e) && e.code === 'unavailable' && e.details.reason !== 'breaker_open';

export const withBreaker =
  <Req>(breaker: Breaker, policy: Pick<GatewayPolicy<Req>, 'provider' | 'label' | 'breaker'>): Layer<Req> =>
  (inner) => ({
    async call<T>(req: Req) {
      if (!breaker.allow()) {
        const retryAfterS = Math.ceil((policy.breaker?.cooldownMs ?? 30_000) / 1000);
        throw new ProviderError('unavailable', `${policy.label} is not answering; calls are paused for a moment.`, { provider: policy.provider, reason: 'breaker_open', retryAfterS });
      }
      try {
        const res = await inner.call<T>(req);
        breaker.succeeded();
        return res;
      } catch (e) {
        if (providerTrouble(e)) breaker.failed();
        else if (breaker.state === 'trial') {
          // the provider answered (a 4xx is still an answer): it is up. Our own refusals prove nothing.
          if (isProviderError(e) && e.details.status != null) breaker.succeeded();
          else breaker.release();
        }
        throw e;
      }
    },
  });
