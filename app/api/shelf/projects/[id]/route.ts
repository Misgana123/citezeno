import { json } from '@/lib/http';
import { renameBody } from '@/lib/shelf/api/bodies';
import { ShelfError } from '@/lib/shelf/errors';
import { shelfRoute } from '@/lib/shelf/route';
import { deleteProject, renameProject } from '@/lib/shelf/store/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type P = { id: string };
const notFound = () => new ShelfError('not_found', 'That project no longer exists.');

export const PATCH = shelfRoute<P>(async (ctx, { id }) => {
  const { name } = await ctx.body(renameBody);
  if (!(await renameProject(ctx.db, ctx.userId, id, name))) throw notFound();
  return json({ ok: true });
});

/* The papers stay on the shelf; only the project and its folders go. */
export const DELETE = shelfRoute<P>(async ({ db, userId }, { id }) => {
  if (!(await deleteProject(db, userId, id))) throw notFound();
  return json({ ok: true });
});
