import { isProviderError } from '@/lib/providers/errors';

/* Every Find Papers failure becomes a PapersError with a code the API route
   turns into a status and the UI turns into a friendly message. */

export type PapersErrorCode =
  | 'bad_request' // our request was invalid (input or an unsupported filter)
  | 'not_found' // the paper does not exist
  | 'busy' // rate limited / queue full; try again in a moment
  | 'unavailable' // OpenAlex is down, timed out or answered badly
  | 'budget' // the daily spending cap was reached
  | 'user_limit'; // this user's daily search limit was reached

export class PapersError extends Error {
  constructor(
    readonly code: PapersErrorCode,
    message: string,
    readonly details: { retryAfterS?: number; reason?: string; status?: number; resetsAt?: string; limit?: number } = {},
  ) {
    super(message);
    this.name = 'PapersError';
  }
}

export const isPapersError = (e: unknown): e is PapersError => e instanceof PapersError;

/* A paper provider's error in Find Papers' terms. Something the active
   provider can't do becomes a bad request the user can read. Anything else is
   returned as it is. */
export function toPapersError(e: unknown): unknown {
  if (!isProviderError(e)) return e;
  const { provider: _provider, ...details } = e.details ?? {};
  if (e.code === 'unsupported') return new PapersError('bad_request', e.message, details);
  return new PapersError(e.code, e.message, details);
}

export const HTTP_STATUS: Record<PapersErrorCode, number> = {
  bad_request: 400,
  not_found: 404,
  busy: 503,
  unavailable: 502,
  budget: 503,
  user_limit: 429,
};
