import { json } from '@/lib/http';
import { shelfRoute } from '@/lib/shelf/route';
import { listFolders } from '@/lib/shelf/store/folders';
import { listProjects } from '@/lib/shelf/store/projects';
import { listTags } from '@/lib/shelf/store/tags';
import { shelfCounts } from '@/lib/shelf/store/counts';
import { countDuplicatePairs } from '@/lib/shelf/dedupe/possible';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Everything the shelf sidebar shows, in one request. A lab guest sees only
   the projects shared with them (and those projects' folders). */
export const GET = shelfRoute(async ({ db, userId, space }) => {
  const [projects, folders, tags, counts, duplicates] = await Promise.all([
    listProjects(db, userId),
    listFolders(db, userId),
    listTags(db, userId),
    shelfCounts(db, userId),
    countDuplicatePairs(db, userId),
  ]);
  if (space?.guest) {
    const mine = space.guest;
    return json({ projects: projects.filter((p) => mine.has(p.id)), folders: folders.filter((f) => mine.has(f.projectId)), tags: [], counts: { ...counts, duplicates: 0 }, access: Object.fromEntries(mine) });
  }
  return json({ projects, folders, tags, counts: { ...counts, duplicates } });
});
