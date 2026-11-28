import { z } from 'zod';
import { json } from '@/lib/http';
import { labRoute } from '@/lib/labs/route';
import { copyToLab } from '@/lib/labs/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const body = z.object({ itemIds: z.array(z.string().min(1).max(80)).min(1).max(500), projectId: z.string().trim().min(1).max(80) });

/* Copy papers from your shelf into one of the lab's projects. */
export const POST = labRoute(async ({ deps, user, body: read }) => {
  const b = await read(body);
  return json(await copyToLab(deps, user.id, b.itemIds, b.projectId));
});
