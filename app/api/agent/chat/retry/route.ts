import { readBody, retryBody } from '@/lib/agent/bodies';
import { agentRoute, replyToRetry } from '@/lib/agent/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* Try again: the last answer is dropped and the user's last message answered afresh, streamed back like a message. */
export const POST = agentRoute(async (req, userId) => replyToRetry(req, userId, await readBody(req, retryBody)));
