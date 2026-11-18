import { json } from '@/lib/http';
import { tagPatchBody } from '@/lib/shelf/api/bodies';
import { ShelfError } from '@/lib/shelf/errors';
import { shelfRoute } from '@/lib/shelf/route';
import { deleteTag, updateTag } from '@/lib/shelf/store/tags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type P = { id: string };
const notFound = () => new ShelfError('not_found', 'That tag no longer exists.');

export const PATCH = shelfRoute<P>(async (ctx, { id }) => {
  const patch = await ctx.body(tagPatchBody);
  if (!(await updateTag(ctx.db, ctx.userId, id, patch))) throw notFound();
  return json({ ok: true });
});

export const DELETE = shelfRoute<P>(async ({ db, userId }, { id }) => {
  if (!(await deleteTag(db, userId, id))) throw notFound();
  return json({ ok: true });
});
