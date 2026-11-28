import { z } from 'zod';
import { json } from '@/lib/http';
import { labRoute } from '@/lib/labs/route';
import { createLab, deleteLab, labView, renameLab } from '@/lib/labs/service';
import { LAB_NAME_MAX } from '@/lib/labs/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const name = z.object({ name: z.string().trim().min(1, 'Give the lab a name.').max(LAB_NAME_MAX) });

/* Your lab: members, invitations (admins), the share link, and what your plan allows. */
export const GET = labRoute(async ({ deps, user }) => json(await labView(deps, user.id)));

/* Make a lab (the Lab plan). */
export const POST = labRoute(async ({ deps, user, body }) => {
  await createLab(deps, user.id, (await body(name)).name);
  return json(await labView(deps, user.id), 201);
});

export const PATCH = labRoute(async ({ deps, user, body }) => {
  await renameLab(deps, user.id, (await body(name)).name);
  return json(await labView(deps, user.id));
});

/* Delete the lab and its shelf (the owner). */
export const DELETE = labRoute(async ({ deps, user }) => {
  await deleteLab(deps, user.id);
  return json({ deleted: true });
});
