import 'server-only';
import { json } from '@/lib/http';
import { HTTP_STATUS, isPapersError, PapersError } from './errors';
import { userMessage } from './messages';

/* Any error thrown inside a /api/papers route → a JSON error the UI can show.
   Unknown errors are logged and shown as "temporarily unavailable". */
export function errorResponse(e: unknown): Response {
  const err = isPapersError(e) ? e : new PapersError('unavailable', 'Unexpected error.');
  if (!isPapersError(e)) console.error('[citezeno] papers: unexpected error', e);
  else if (err.code === 'unavailable' || err.code === 'budget') console.warn(`[citezeno] papers: ${err.code}: ${err.message}`, err.details);
  const res = json({ error: userMessage(err), code: err.code, ...(err.details.retryAfterS != null ? { retryAfterS: err.details.retryAfterS } : {}) }, HTTP_STATUS[err.code]);
  if (err.details.retryAfterS != null) res.headers.set('retry-after', String(Math.ceil(err.details.retryAfterS)));
  return res;
}

export function signedOut(): Response {
  return json({ error: 'Sign in to search for papers.', code: 'signed_out' }, 401);
}
