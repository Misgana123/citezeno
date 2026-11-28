import { z } from 'zod';
import { json } from '@/lib/http';
import { labRoute } from '@/lib/labs/route';
import { removeMember, updateMember } from '@/lib/labs/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patch = z.object({ role: z.enum(['admin', 'member']).optional(), creditCap: z.number().int().min(0).max(1_000_000).nullable().optional() });

/* Change someone's role or monthly credit cap. */
export const PATCH = labRoute<{ userId: string }>(async ({ deps, user, body }, { userId }) => {
  await updateMember(deps, user.id, userId, await body(patch));
  return json({ ok: true });
});

/* Remove someone; your own ID leaves (?lab= picks a lab you're a guest in). */
export const DELETE = labRoute<{ userId: string }>(async ({ req, deps, user }, { userId }) => {
  await removeMember(deps, user.id, userId === 'me' ? user.id : userId, new URL(req.url).searchParams.get('lab') ?? undefined);
  return json({ removed: true });
});
