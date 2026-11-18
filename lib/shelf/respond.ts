import 'server-only';
import { json } from '@/lib/http';
import { isPapersError } from '@/lib/papers/errors';
import { errorResponse as papersErrorResponse } from '@/lib/papers/respond';
import { isShelfError, SHELF_STATUS } from './errors';

/* Any error thrown inside a /api/shelf route → a JSON error the UI can show.
   OpenAlex failures keep Find Papers' wording; unknown errors are logged. */
export function shelfErrorResponse(e: unknown): Response {
  if (isShelfError(e)) {
    return json({ error: e.message, code: e.code, ...(e.details.itemId ? { itemId: e.details.itemId } : {}), ...(e.details.resetsAt ? { resetsAt: e.details.resetsAt } : {}) }, SHELF_STATUS[e.code]);
  }
  if (isPapersError(e)) return papersErrorResponse(e);
  console.error('[citezeno] shelf: unexpected error', e);
  return json({ error: 'Something went wrong. Please try again.', code: 'unavailable' }, 500);
}

export const shelfSignedOut = () => json({ error: 'Sign in to use your shelf.', code: 'signed_out' }, 401);
