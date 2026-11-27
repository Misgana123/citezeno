import { clientResultBody, readBody } from '@/lib/agent/bodies';
import { agentRoute, replyToClientResult } from '@/lib/agent/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* The result of a step the chat page ran in the browser (the citation search).
   The rest of the reply streams back like a message. */
export const POST = agentRoute(async (req, userId) => replyToClientResult(req, userId, await readBody(req, clientResultBody)));
