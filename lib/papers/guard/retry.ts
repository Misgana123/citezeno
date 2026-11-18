import { isPapersError } from '../errors';
import type { QueryParams } from '../openalex/client';
import type { Layer } from './call';
import { sleep as realSleep, type Sleep } from './pacer';

/* Retry OpenAlex's per-second 429s: wait Retry-After (or back off 1s, 2s, 4s…)
   and try again, up to `tries` attempts in all. Anything else fails at once. */

export const DEFAULT_TRIES = 3;
export const MAX_BACKOFF_MS = 8000;

export function backoffMs(attempt: number, retryAfterS?: number) {
  const ms = retryAfterS != null ? retryAfterS * 1000 : 1000 * 2 ** (attempt - 1);
  return Math.min(MAX_BACKOFF_MS, Math.max(250, ms));
}

const retriable = (e: unknown) => isPapersError(e) && e.code === 'busy' && e.details.status === 429;

export const withRetry =
  (opts: { tries?: number; sleep?: Sleep } = {}): Layer =>
  (inner) => ({
    async get<T>(path: string, params: QueryParams = {}) {
      const tries = opts.tries ?? DEFAULT_TRIES;
      for (let attempt = 1; ; attempt++) {
        try {
          return await inner.get<T>(path, params);
        } catch (e) {
          if (!retriable(e) || attempt >= tries) throw e;
          await (opts.sleep ?? realSleep)(backoffMs(attempt, isPapersError(e) ? e.details.retryAfterS : undefined));
        }
      }
    },
  });
