import { after } from 'next/server';
import { pool } from '@/lib/db';
import { codeSandboxFor } from '@/lib/providers/server';
import { json } from '@/lib/http';
import { conversationPatchBody, readBody } from '@/lib/agent/bodies';
import { AgentHttpError, agentRoute } from '@/lib/agent/server';
import { deleteConversation, getConversation, getSandboxId, loadMessages, renameConversation, setPinned } from '@/lib/agent/store';
import { toView } from '@/lib/agent/view';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type P = { id: string };
const notFound = () => new AgentHttpError(404, 'That conversation no longer exists.', 'not_found');

/* One conversation, to reopen it. */
export const GET = agentRoute<P>(async (_req, userId, { id }) => {
  const c = await getConversation(pool, userId, id);
  if (!c) throw notFound();
  const messages = await loadMessages(pool, c.id);
  // a lab chat names the people who wrote in it
  const ids = c.labId ? [...new Set(messages.flatMap((m) => (m.authorId ? [m.authorId] : [])))] : [];
  const names = ids.length ? new Map((await pool.query<{ id: string; name: string | null; email: string }>(`select id, name, email from "user" where id = any($1::text[])`, [ids])).rows.map((u) => [u.id, u.name || u.email])) : new Map<string, string>();
  return json(toView(c, messages, c.labId ? { names, viewer: userId } : undefined));
});

export const PATCH = agentRoute<P>(async (req, userId, { id }) => {
  const { title, pinned } = await readBody(req, conversationPatchBody);
  if (title !== undefined && !(await renameConversation(pool, userId, id, title))) throw notFound();
  if (pinned !== undefined && !(await setPinned(pool, userId, id, pinned))) throw notFound();
  return json({ ok: true });
});

export const DELETE = agentRoute<P>(async (_req, userId, { id }) => {
  const sandboxId = await getSandboxId(pool, userId, id);
  if (!(await deleteConversation(pool, userId, id))) throw notFound();
  // its code sandbox, if one is still open (it would end on its own when idle)
  if (sandboxId) after(() => codeSandboxFor()?.close(sandboxId).catch(() => {}));
  return json({ ok: true });
});
