import { json } from '@/lib/http';
import { duplicateBody } from '@/lib/shelf/api/bodies';
import { duplicatePairs, keepBoth } from '@/lib/shelf/dedupe/possible';
import { ShelfError } from '@/lib/shelf/errors';
import { shelfRoute } from '@/lib/shelf/route';
import { mergeItems } from '@/lib/shelf/service/merge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Pairs of papers on the shelf that look like the same paper. */
export const GET = shelfRoute(async ({ db, userId }) => json({ pairs: await duplicatePairs(db, userId) }));

/* Merge a pair, or keep both (and stop offering the pair). */
export const POST = shelfRoute(async (ctx) => {
  const { action, a, b } = await ctx.body(duplicateBody);
  if (action === 'merge') return json(await mergeItems(ctx.db, ctx.userId, a, b));
  if (!(await keepBoth(ctx.db, ctx.userId, a, b))) throw new ShelfError('not_found', 'One of these papers is no longer on your shelf.');
  return json({ ok: true });
});
