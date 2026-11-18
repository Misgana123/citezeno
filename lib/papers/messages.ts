import type { PapersError, PapersErrorCode } from './errors';

/* What the user reads for each kind of failure. */
const MESSAGES: Record<Exclude<PapersErrorCode, 'bad_request'>, string> = {
  not_found: 'That paper could not be found.',
  busy: 'Search is busy, please try again in a moment.',
  unavailable: 'Paper search is temporarily unavailable. Please try again shortly.',
  budget: 'Paper search is temporarily unavailable. Please try again shortly.',
  user_limit: "You've reached today's search limit.",
};

/* "in 3 hours" / "in 25 minutes" until the limit resets. */
export function resetsIn(resetsAt: string, now: number = Date.now()): string {
  const mins = Math.max(1, Math.ceil((Date.parse(resetsAt) - now) / 60_000));
  if (mins < 60) return `in ${mins} minute${mins === 1 ? '' : 's'}`;
  const hours = Math.round(mins / 60);
  return `in about ${hours} hour${hours === 1 ? '' : 's'}`;
}

/* bad_request messages are written for the user already; the rest are replaced. */
export function userMessage(e: PapersError, now: number = Date.now()): string {
  if (e.code === 'bad_request') return e.message;
  if (e.code === 'user_limit' && e.details.resetsAt) {
    return `${MESSAGES.user_limit} It resets at midnight UTC (${resetsIn(e.details.resetsAt, now)}).`;
  }
  return MESSAGES[e.code];
}
