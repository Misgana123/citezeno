import { json } from '@/lib/http';
import { lookupBody } from '@/lib/shelf/api/bodies';
import { parseInput } from '@/lib/shelf/lookup/parse-input';
import { needsSearch, resolveInput } from '@/lib/shelf/lookup/resolve';
import { shelfRoute } from '@/lib/shelf/route';
import { savedMap } from '@/lib/shelf/store/items';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Find a paper from a DOI, a link or a title before saving it. A title search
   counts toward the user's daily search limit; ID lookups are free. Each match
   says whether it is already on the shelf. */
export const POST = shelfRoute(async (ctx) => {
  const { input } = await ctx.body(lookupBody);
  const parsed = parseInput(input);
  const sources = ctx.sources();
  if (needsSearch(sources, parsed)) await ctx.reserveSearches(1);
  const result = await resolveInput(sources, parsed);
  const saved = await savedMap(ctx.db, ctx.userId, result.papers.map((p) => p.id));
  return json({ ...result, saved });
});
