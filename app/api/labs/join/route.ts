import { z } from 'zod';
import { json } from '@/lib/http';
import { labRoute } from '@/lib/labs/route';
import { acceptInvite, inviteInfo } from '@/lib/labs/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const token = z.string().trim().min(10).max(200);

/* What an invitation is for (shown before joining). */
export const GET = labRoute(async ({ req, deps }) => json(await inviteInfo(deps, token.parse(new URL(req.url).searchParams.get('token') ?? ''))));

/* Join with an invitation. */
export const POST = labRoute(async ({ deps, user, body }) => {
  const lab = await acceptInvite(deps, user, (await body(z.object({ token }))).token);
  return json({ lab: { id: lab.id, name: lab.name } });
});
