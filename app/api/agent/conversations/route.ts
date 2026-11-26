import { pool } from '@/lib/db';
import { json } from '@/lib/http';
import { agentModels, agentRoute } from '@/lib/agent/server';
import { listConversations } from '@/lib/agent/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* The user's conversations, newest first, and the models they can pick. */
export const GET = agentRoute(async (_req, userId) => json({ conversations: await listConversations(pool, userId), ...(await agentModels(userId)) }));
