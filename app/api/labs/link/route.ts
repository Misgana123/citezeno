import { z } from 'zod';
import { json } from '@/lib/http';
import { labRoute } from '@/lib/labs/route';
import { setShareLink } from '@/lib/labs/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Turn the lab's share link on (it's made once and kept) or off. */
export const POST = labRoute(async ({ deps, user, body }) => json({ url: await setShareLink(deps, user.id, (await body(z.object({ on: z.boolean() }))).on) }));
