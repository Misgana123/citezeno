import { json } from '@/lib/http';
import { folderBody } from '@/lib/shelf/api/bodies';
import { shelfRoute } from '@/lib/shelf/route';
import { createFolder, listFolders } from '@/lib/shelf/store/folders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = shelfRoute(async ({ db, userId }) => json({ folders: await listFolders(db, userId) }));

export const POST = shelfRoute(async (ctx) => {
  const { projectId, name } = await ctx.body(folderBody);
  return json(await createFolder(ctx.db, ctx.userId, projectId, name), 201);
});
