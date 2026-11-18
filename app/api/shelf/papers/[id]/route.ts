import { json } from '@/lib/http';
import { itemPatchBody } from '@/lib/shelf/api/bodies';
import { ShelfError } from '@/lib/shelf/errors';
import { shelfRoute } from '@/lib/shelf/route';
import { deleteItems, getItem, updateItem } from '@/lib/shelf/store/items';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type P = { id: string };
const notFound = () => new ShelfError('not_found', 'That paper is not on your shelf.');

/* One saved paper, with its note, tags and projects. */
export const GET = shelfRoute<P>(async ({ db, userId }, { id }) => {
  const item = await getItem(db, userId, id);
  if (!item) throw notFound();
  return json(item);
});

/* Change the note or reading status. */
export const PATCH = shelfRoute<P>(async (ctx, { id }) => {
  const patch = await ctx.body(itemPatchBody);
  const item = await updateItem(ctx.db, ctx.userId, id, patch);
  if (!item) throw notFound();
  return json(item);
});

/* Remove the paper from the shelf. */
export const DELETE = shelfRoute<P>(async ({ db, userId }, { id }) => {
  const { deleted } = await deleteItems(db, userId, [id]);
  if (!deleted.length) throw notFound();
  return json({ ok: true });
});
