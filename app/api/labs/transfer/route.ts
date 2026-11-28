import { z } from 'zod';
import { json } from '@/lib/http';
import { labRoute } from '@/lib/labs/route';
import { transferLab } from '@/lib/labs/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Hand the lab over to an admin or member (who has the Lab plan). */
export const POST = labRoute(async ({ deps, user, body }) => {
  await transferLab(deps, user.id, (await body(z.object({ userId: z.string().trim().min(1).max(80) }))).userId);
  return json({ ok: true });
});
