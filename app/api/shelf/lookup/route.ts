import { json } from '@/lib/http';
import { lookupBody } from '@/lib/shelf/api/bodies';
import { shelfRoute } from '@/lib/shelf/route';
import { lookupPaper } from '@/lib/shelf/service/lookup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Find a paper from a DOI, a link or a title before saving it. A title search
   counts toward the user's daily search limit; ID lookups are free. Each match
   says whether it is already on the shelf. */
export const POST = shelfRoute(async (ctx) => {
  const { input } = await ctx.body(lookupBody);
  return json(await lookupPaper({ db: ctx.db, sources: ctx.sources(), reserveSearches: ctx.reserveSearches }, ctx.userId, input));
});
