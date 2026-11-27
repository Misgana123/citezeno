import { messageBody, readBody } from '@/lib/agent/bodies';
import { agentRoute, replyToMessage } from '@/lib/agent/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* Send a message (starting a conversation if needed). The reply streams back
   as one JSON event per line: each step, the agent's words, questions. */
export const POST = agentRoute(async (req, userId) => replyToMessage(req, userId, await readBody(req, messageBody)));
