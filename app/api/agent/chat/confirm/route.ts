import { confirmBody, readBody } from '@/lib/agent/bodies';
import { agentRoute, replyToConfirmation } from '@/lib/agent/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* Yes / No to a step that asked first (deleting, merging, bulk changes,
   large exports). The rest of the reply streams back like a message. */
export const POST = agentRoute(async (req, userId) => replyToConfirmation(req, userId, await readBody(req, confirmBody)));
