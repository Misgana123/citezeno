import { readBody, researchBody } from '@/lib/agent/bodies';
import { agentRoute, replyWithResearch } from '@/lib/agent/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/* Deep research searches and reads for a few minutes before it writes. */
export const maxDuration = 300;

/* Start deep research (from the + menu). The work streams back like a reply:
   each search and page read as a step, then the report. */
export const POST = agentRoute(async (req, userId) => replyWithResearch(req, userId, await readBody(req, researchBody)));
