import { json } from '@/lib/http';
import { tagBody } from '@/lib/shelf/api/bodies';
import { shelfRoute } from '@/lib/shelf/route';
import { createTag, listTags } from '@/lib/shelf/store/tags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = shelfRoute(async ({ db, userId }) => json({ tags: await listTags(db, userId) }));

export const POST = shelfRoute(async (ctx) => {
  const { name, color } = await ctx.body(tagBody);
  return json(await createTag(ctx.db, ctx.userId, name, color), 201);
});
