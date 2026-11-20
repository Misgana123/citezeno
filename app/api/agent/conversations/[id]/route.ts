import { pool } from '@/lib/db';
import { json } from '@/lib/http';
import { conversationPatchBody, readBody } from '@/lib/agent/bodies';
import { AgentHttpError, agentRoute } from '@/lib/agent/server';
import { deleteConversation, getConversation, loadMessages, renameConversation, setPinned } from '@/lib/agent/store';
import { toView } from '@/lib/agent/view';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type P = { id: string };
const notFound = () => new AgentHttpError(404, 'That conversation no longer exists.', 'not_found');

/* One conversation, to reopen it. */
export const GET = agentRoute<P>(async (_req, userId, { id }) => {
  const c = await getConversation(pool, userId, id);
  if (!c) throw notFound();
  return json(toView(c, await loadMessages(pool, c.id)));
});

export const PATCH = agentRoute<P>(async (req, userId, { id }) => {
  const { title, pinned } = await readBody(req, conversationPatchBody);
  if (title !== undefined && !(await renameConversation(pool, userId, id, title))) throw notFound();
  if (pinned !== undefined && !(await setPinned(pool, userId, id, pinned))) throw notFound();
  return json({ ok: true });
});

export const DELETE = agentRoute<P>(async (_req, userId, { id }) => {
  if (!(await deleteConversation(pool, userId, id))) throw notFound();
  return json({ ok: true });
});
