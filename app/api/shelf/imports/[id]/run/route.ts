import { json } from '@/lib/http';
import { ShelfError } from '@/lib/shelf/errors';
import { shelfRoute } from '@/lib/shelf/route';
import { runImportSlice } from '@/lib/shelf/service/import-run';
import { getImport } from '@/lib/shelf/store/imports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/* While the import page is open it asks for the next few seconds of work. */
export const POST = shelfRoute<{ id: string }>(async (ctx, { id }) => {
  if (!(await getImport(ctx.db, ctx.userId, id))) throw new ShelfError('not_found', 'That import no longer exists.');
  await runImportSlice({ db: ctx.db, papers: ctx.papers() }, { id, userId: ctx.userId, budgetMs: 8_000 });
  return json(await getImport(ctx.db, ctx.userId, id));
});
