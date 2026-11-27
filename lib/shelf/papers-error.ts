import type { PapersError, PapersErrorCode } from '@/lib/papers/errors';

/* A Find Papers error's code, or null. Checked by name rather than instanceof:
   in development the shared OpenAlex client outlives hot reloads, so its errors
   can come from an older copy of the PapersError class. */
export function papersErrorCode(e: unknown): PapersErrorCode | null {
  const err = e as Partial<PapersError> | null;
  return err?.name === 'PapersError' && typeof err.code === 'string' ? err.code : null;
}
