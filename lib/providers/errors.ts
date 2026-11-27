/* The one set of errors every provider call ends in. Each adapter turns its
   vendor's failures into these, so features never see a vendor's own errors. */

export type ProviderErrorCode =
  | 'bad_request' // our request was invalid for this provider
  | 'not_found' // the thing asked for does not exist
  | 'busy' // rate limited / queue full; try again in a moment
  | 'unavailable' // the provider is down, timed out or answered badly
  | 'budget' // the daily spending cap was reached
  | 'unsupported'; // the active provider can't do this

export type ProviderErrorDetails = { provider?: string; retryAfterS?: number; reason?: string; status?: number };

export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
    readonly details: ProviderErrorDetails = {},
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/* Checked by name rather than instanceof: in development the shared provider
   clients outlive hot reloads, so their errors can come from an older copy of the class. */
export function isProviderError(e: unknown): e is ProviderError {
  const err = e as Partial<ProviderError> | null;
  return err?.name === 'ProviderError' && typeof err.code === 'string';
}

/* The provider is down, failing or too busy, as opposed to our request being
   wrong or our own spending cap reached: a fallback provider may answer instead. */
export const providerDown = (e: unknown) => isProviderError(e) && (e.code === 'unavailable' || e.code === 'busy');
