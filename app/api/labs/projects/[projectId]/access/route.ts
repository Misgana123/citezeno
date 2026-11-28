import { z } from 'zod';
import { json } from '@/lib/http';
import { labRoute } from '@/lib/labs/route';
import { projectGuests, setProjectAccess } from '@/lib/labs/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* The guests who can open one lab project. */
export const GET = labRoute<{ projectId: string }>(async ({ deps, user }, { projectId }) => json({ people: await projectGuests(deps, user.id, projectId) }));

/* Give a guest view or edit access to the project, or take it away (null). */
export const POST = labRoute<{ projectId: string }>(async ({ deps, user, body }, { projectId }) => {
  const b = await body(z.object({ userId: z.string().trim().min(1).max(80), access: z.enum(['view', 'edit']).nullable() }));
  await setProjectAccess(deps, user.id, projectId, b.userId, b.access);
  return json({ ok: true });
});
