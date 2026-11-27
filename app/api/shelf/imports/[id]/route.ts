import { json } from '@/lib/http';
import { ShelfError } from '@/lib/shelf/errors';
import { shelfRoute } from '@/lib/shelf/route';
import { getImport } from '@/lib/shelf/store/imports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* An import's progress, and once done its summary (with the entries that failed and why). */
export const GET = shelfRoute<{ id: string }>(async ({ db, userId }, { id }) => {
  const summary = await getImport(db, userId, id);
  if (!summary) throw new ShelfError('not_found', 'That import no longer exists.');
  return json(summary);
});
