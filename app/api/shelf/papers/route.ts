import { json } from '@/lib/http';
import { saveBody } from '@/lib/shelf/api/bodies';
import { parseListRequest } from '@/lib/shelf/api/list-request';
import { shelfRoute } from '@/lib/shelf/route';
import { saveFromSearch } from '@/lib/shelf/service/save-search';
import { listItems } from '@/lib/shelf/store/items';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* The user's shelf: filters, sorting and pages from the query string. */
export const GET = shelfRoute(async ({ req, db, userId }) => {
  const query = parseListRequest(new URL(req.url).searchParams);
  return json(await listItems(db, userId, query));
});

/* Save a paper. Already saved → 409 with the existing item's ID. */
export const POST = shelfRoute(async (ctx) => {
  const body = await ctx.body(saveBody);
  const result = await saveFromSearch({ db: ctx.db, client: ctx.openalex() }, ctx.userId, body);
  return json(result, 201);
});
