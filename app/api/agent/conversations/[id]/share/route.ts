import { pool } from '@/lib/db';
import { json } from '@/lib/http';
import { AgentHttpError, agentRoute } from '@/lib/agent/server';
import { shareConversation, shareState, unshareConversation } from '@/lib/agent/share';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* The chat's read-only public link: whether it is shared (GET), make or update
   the link (POST: it then shows every message so far), stop sharing (DELETE). */

type P = { id: string };
const notFound = () => new AgentHttpError(404, 'That conversation no longer exists.', 'not_found');

export const GET = agentRoute<P>(async (_req, userId, { id }) => {
  const s = await shareState(pool, userId, id);
  if (!s) throw notFound();
  return json(s);
});

export const POST = agentRoute<P>(async (_req, userId, { id }) => {
  const s = await shareConversation(pool, userId, id);
  if (!s) throw notFound();
  return json(s);
});

export const DELETE = agentRoute<P>(async (_req, userId, { id }) => {
  if (!(await unshareConversation(pool, userId, id))) throw notFound();
  return json({ ok: true });
});
