import { z } from 'zod';
import { json } from '@/lib/http';
import { labRoute } from '@/lib/labs/route';
import { invite } from '@/lib/labs/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const body = z.object({
  email: z.string().trim().max(320),
  role: z.enum(['admin', 'member', 'guest']).default('member'),
  projectId: z.string().trim().max(80).nullish(),
  access: z.enum(['view', 'edit']).nullish(),
});

/* Invite someone by email (a member, an admin, or a guest on one project). */
export const POST = labRoute(async ({ deps, user, body: read }) => json({ invite: await invite(deps, user.id, { ...(await read(body)), inviterName: user.name }) }, 201));
