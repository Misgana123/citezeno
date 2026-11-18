import { json } from '@/lib/http';
import { projectBody } from '@/lib/shelf/api/bodies';
import { shelfRoute } from '@/lib/shelf/route';
import { createProject, listProjects } from '@/lib/shelf/store/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = shelfRoute(async ({ db, userId }) => json({ projects: await listProjects(db, userId) }));

export const POST = shelfRoute(async (ctx) => {
  const { name } = await ctx.body(projectBody);
  return json(await createProject(ctx.db, ctx.userId, name), 201);
});
