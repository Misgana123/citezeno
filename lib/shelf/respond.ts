import 'server-only';
import { json } from '@/lib/http';
import { PapersError } from '@/lib/papers/errors';
import { errorResponse as papersErrorResponse } from '@/lib/papers/respond';
import { isShelfError, SHELF_STATUS } from './errors';
import { papersErrorCode } from './papers-error';

/* Any error thrown inside a /api/shelf route → a JSON error the UI can show.
   Paper provider failures keep Find Papers' wording; unknown errors are logged. */
export function shelfErrorResponse(e: unknown): Response {
  if (isShelfError(e)) {
    return json({ error: e.message, code: e.code, ...(e.details.itemId ? { itemId: e.details.itemId } : {}), ...(e.details.resetsAt ? { resetsAt: e.details.resetsAt } : {}) }, SHELF_STATUS[e.code]);
  }
  if (papersErrorCode(e)) {
    const err = e as PapersError;
    return papersErrorResponse(new PapersError(err.code, err.message, err.details ?? {}));
  }
  console.error('[citezeno] shelf: unexpected error', e);
  return json({ error: 'Something went wrong. Please try again.', code: 'unavailable' }, 500);
}

export const shelfSignedOut = () => json({ error: 'Sign in to use your shelf.', code: 'signed_out' }, 401);
