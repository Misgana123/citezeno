import { json } from '@/lib/http';
import { duplicateBody } from '@/lib/shelf/api/bodies';
import { duplicatePairs } from '@/lib/shelf/dedupe/possible';
import { shelfRoute } from '@/lib/shelf/route';
import { decideDuplicate } from '@/lib/shelf/service/duplicate-choice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Pairs of papers on the shelf that look like the same paper. */
export const GET = shelfRoute(async ({ db, userId }) => json({ pairs: await duplicatePairs(db, userId) }));

/* Merge a pair, or keep both (and stop offering the pair). */
export const POST = shelfRoute(async (ctx) => {
  const { action, a, b } = await ctx.body(duplicateBody);
  return json(await decideDuplicate(ctx.db, ctx.userId, action, a, b));
});
