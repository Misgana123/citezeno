import { isProviderError, type ProviderError } from '../errors';
import { sleep as realSleep, type Sleep } from './pacer';
import type { Layer } from './types';

/* Retry a provider's per-second 429s: wait Retry-After (or back off 1s, 2s, 4s…)
   and try again, up to `tries` attempts in all. Providers whose calls are safe
   to repeat can also ask for `transientTries` extra attempts after a timeout,
   a failed connection or a server error (5xx). Anything else fails at once. */

export const DEFAULT_TRIES = 3;
export const MAX_BACKOFF_MS = 8000;
export const TRANSIENT_BACKOFF_MS = 500;

export function backoffMs(attempt: number, retryAfterS?: number) {
  const ms = retryAfterS != null ? retryAfterS * 1000 : 1000 * 2 ** (attempt - 1);
  return Math.min(MAX_BACKOFF_MS, Math.max(250, ms));
}

const rateLimited = (e: unknown): e is ProviderError => isProviderError(e) && e.code === 'busy' && e.details.status === 429;

/* A hiccup worth one more try: the provider timed out, couldn't be reached,
   answered 5xx, or answered with nothing at all. */
const HICCUPS = new Set(['timeout', 'network', 'empty_answer']);
export const transient = (e: unknown): e is ProviderError =>
  isProviderError(e) && e.code === 'unavailable' && ((e.details.status ?? 0) >= 500 || HICCUPS.has(e.details.reason ?? ''));

export const withRetry =
  <Req>(opts: { tries?: number; transientTries?: number; sleep?: Sleep } = {}): Layer<Req> =>
  (inner) => ({
    async call<T>(req: Req) {
      const tries = opts.tries ?? DEFAULT_TRIES;
      let transientLeft = opts.transientTries ?? 0;
      const sleep = opts.sleep ?? realSleep;
      for (let attempt = 1; ; attempt++) {
        try {
          return await inner.call<T>(req);
        } catch (e) {
          if (rateLimited(e) && attempt < tries) {
            await sleep(backoffMs(attempt, e.details.retryAfterS));
          } else if (transient(e) && transientLeft > 0) {
            transientLeft--;
            await sleep(TRANSIENT_BACKOFF_MS);
          } else {
            throw e;
          }
        }
      }
    },
  });
