import type { PapersError, PapersErrorCode } from './errors';

/* What the user reads for each kind of failure. */
const MESSAGES: Record<Exclude<PapersErrorCode, 'bad_request'>, string> = {
  not_found: 'That paper could not be found.',
  busy: 'Search is busy, please try again in a moment.',
  unavailable: 'Paper search is temporarily unavailable. Please try again shortly.',
  budget: 'Paper search is temporarily unavailable. Please try again shortly.',
  user_limit: "You've reached today's search limit.",
};

/* bad_request messages are written for the user already; the rest are replaced. */
export function userMessage(e: PapersError): string {
  return e.code === 'bad_request' ? e.message : MESSAGES[e.code];
}
