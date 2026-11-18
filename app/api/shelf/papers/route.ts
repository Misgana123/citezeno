import { json } from '@/lib/http';
import { saveBody } from '@/lib/shelf/api/bodies';
import { savedResponse } from '@/lib/shelf/api/saved-response';
import { parseListRequest } from '@/lib/shelf/api/list-request';
import { shelfRoute } from '@/lib/shelf/route';
import { saveManualPaper } from '@/lib/shelf/service/save-manual';
import { saveOpenAlexPaper } from '@/lib/shelf/service/save-openalex';
import { listItems } from '@/lib/shelf/store/items';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* The user's shelf: filters, sorting and pages from the query string. */
export const GET = shelfRoute(async ({ req, db, userId }) => {
  const query = parseListRequest(new URL(req.url).searchParams);
  return json(await listItems(db, userId, query));
});

/* Save a paper: from Find Papers, after a DOI / link / title lookup, or typed
   in by hand. Already saved → 409 with the existing item's ID. */
export const POST = shelfRoute(async (ctx) => {
  const body = await ctx.body(saveBody);
  if (body.via === 'manual') {
    const item = await saveManualPaper(ctx.db, ctx.userId, body.details, body.projectId);
    return json(await savedResponse(ctx.db, ctx.userId, item), 201);
  }
  const { item, pending } = await saveOpenAlexPaper({ db: ctx.db, client: ctx.openalex() }, ctx.userId, body);
  return json(await savedResponse(ctx.db, ctx.userId, item, pending), 201);
});
