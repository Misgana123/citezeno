import { json } from '@/lib/http';
import { pdfConfirmBody } from '@/lib/shelf/api/bodies';
import { savedResponse } from '@/lib/shelf/api/saved-response';
import { shelfRoute } from '@/lib/shelf/route';
import { confirmUpload } from '@/lib/shelf/service/pdf-upload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Which paper the PDF is: a match from a paper provider, a paper already on the shelf, or details typed in. */
export const POST = shelfRoute<{ id: string }>(async (ctx, { id }) => {
  const choice = await ctx.body(pdfConfirmBody);
  const item = await confirmUpload({ db: ctx.db, sources: ctx.sources, config: ctx.config }, ctx.userId, id, choice);
  return json(await savedResponse(ctx.db, ctx.userId, item));
});
