import { after } from 'next/server';
import { json } from '@/lib/http';
import { ShelfError } from '@/lib/shelf/errors';
import { shelfRoute } from '@/lib/shelf/route';
import { emptyTrash } from '@/lib/shelf/service/trash';
import { fileStore } from '@/lib/shelf/storage';
import { deletePdf, getPdfRow } from '@/lib/shelf/store/pdfs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type P = { id: string };
const notFound = () => new ShelfError('not_found', 'That PDF no longer exists.');

/* Download: a redirect to a link that works for five minutes, for the owner only. */
export const GET = shelfRoute<P>(async ({ db, userId }, { id }) => {
  const row = await getPdfRow(db, userId, id);
  if (!row || row.status !== 'ready') throw notFound();
  const store = fileStore();
  if (!store) throw new ShelfError('unavailable', 'PDF downloads aren’t set up yet.');
  return new Response(null, { status: 302, headers: { location: store.downloadUrl(row.storageKey, { ttlS: 300, fileName: row.fileName }), 'cache-control': 'no-store' } });
});

/* Delete the PDF: gone from the shelf and the search index now, from storage right after. */
export const DELETE = shelfRoute<P>(async ({ db, userId }, { id }) => {
  if (!(await deletePdf(db, userId, id))) throw notFound();
  after(() => emptyTrash(db, fileStore()).catch(() => {}));
  return json({ ok: true });
});
