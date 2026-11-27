import { json } from '@/lib/http';
import { renameBody } from '@/lib/shelf/api/bodies';
import { ShelfError } from '@/lib/shelf/errors';
import { shelfRoute } from '@/lib/shelf/route';
import { deleteFolder, renameFolder } from '@/lib/shelf/store/folders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type P = { id: string };
const notFound = () => new ShelfError('not_found', 'That folder no longer exists.');

export const PATCH = shelfRoute<P>(async (ctx, { id }) => {
  const { name } = await ctx.body(renameBody);
  if (!(await renameFolder(ctx.db, ctx.userId, id, name))) throw notFound();
  return json({ ok: true });
});

/* The papers stay in the folder's project. */
export const DELETE = shelfRoute<P>(async ({ db, userId }, { id }) => {
  if (!(await deleteFolder(db, userId, id))) throw notFound();
  return json({ ok: true });
});
