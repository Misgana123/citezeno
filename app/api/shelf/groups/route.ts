import { json } from '@/lib/http';
import { shelfRoute } from '@/lib/shelf/route';
import { listFolders } from '@/lib/shelf/store/folders';
import { listProjects } from '@/lib/shelf/store/projects';
import { listTags } from '@/lib/shelf/store/tags';
import { shelfCounts } from '@/lib/shelf/store/counts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Everything the shelf sidebar shows, in one request. */
export const GET = shelfRoute(async ({ db, userId }) => {
  const [projects, folders, tags, counts] = await Promise.all([listProjects(db, userId), listFolders(db, userId), listTags(db, userId), shelfCounts(db, userId)]);
  return json({ projects, folders, tags, counts });
});
