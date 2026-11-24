import { randomUUID } from 'node:crypto';
import type { ChatMessage } from '@/lib/providers/chat/types';
import { iso, tx, type Db, type Queryable } from '@/lib/shelf/db';
import type { Feedback, MessageMeta, Pending, StepView, StoredMessage } from './types';

/* Conversations and their messages. Every query is scoped to the user. */

export type Conversation = { id: string; title: string; model: string; pinned: boolean; webSearch: boolean; pending: Pending | null; costUsd: number; createdAt: string; updatedAt: string };
/* paperId: a paper's own conversation (opened in the reader) */
export type ConversationSummary = Pick<Conversation, 'id' | 'title' | 'model' | 'pinned' | 'updatedAt'> & { paperId?: string | null };

export const TITLE_MAX = 80;

/* A title from the first thing the user asked. */
export function titleFrom(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return (t.length > 60 ? `${t.slice(0, 57).trimEnd()}…` : t) || 'New chat';
}

const row = (r: Record<string, unknown>): Conversation => ({
  id: r.id as string,
  title: r.title as string,
  model: r.model as string,
  pinned: r.pinned === true,
  webSearch: r.webSearch === true,
  pending: (r.pending as Pending | null) ?? null,
  costUsd: Number(r.costUsd ?? 0),
  createdAt: iso(r.createdAt as Date)!,
  updatedAt: iso(r.updatedAt as Date)!,
});

const COLS = `id, title, model, pinned, "webSearch", pending, "costUsd", "createdAt", "updatedAt"`;

export async function createConversation(q: Queryable, userId: string, title: string, model: string, paperId: string | null = null): Promise<Conversation> {
  const { rows } = await q.query(`insert into agent_conversation (id, "userId", title, model, "paperId") values ($1, $2, $3, $4, $5) returning ${COLS}`, [
    `c_${randomUUID()}`,
    userId,
    title.slice(0, TITLE_MAX),
    model,
    paperId,
  ]);
  return row(rows[0]);
}

export async function getConversation(q: Queryable, userId: string, id: string): Promise<Conversation | null> {
  const { rows } = await q.query(`select ${COLS} from agent_conversation where id = $1 and "userId" = $2`, [id, userId]);
  return rows[0] ? row(rows[0]) : null;
}

export async function listConversations(q: Queryable, userId: string, limit = 100): Promise<ConversationSummary[]> {
  const { rows } = await q.query(`select id, title, model, pinned, "updatedAt", "paperId" from agent_conversation where "userId" = $1 order by pinned desc, "updatedAt" desc limit $2`, [userId, limit]);
  return rows.map((r) => ({ id: r.id, title: r.title, model: r.model, pinned: r.pinned === true, updatedAt: iso(r.updatedAt)!, ...(r.paperId ? { paperId: r.paperId as string } : {}) }));
}

export async function renameConversation(q: Queryable, userId: string, id: string, title: string): Promise<boolean> {
  const { rowCount } = await q.query(`update agent_conversation set title = $3 where id = $1 and "userId" = $2`, [id, userId, title.slice(0, TITLE_MAX)]);
  return (rowCount ?? 0) > 0;
}

export async function setPinned(q: Queryable, userId: string, id: string, pinned: boolean): Promise<boolean> {
  const { rowCount } = await q.query(`update agent_conversation set pinned = $3 where id = $1 and "userId" = $2`, [id, userId, pinned]);
  return (rowCount ?? 0) > 0;
}

export async function deleteConversation(q: Queryable, userId: string, id: string): Promise<boolean> {
  const { rowCount } = await q.query(`delete from agent_conversation where id = $1 and "userId" = $2`, [id, userId]);
  return (rowCount ?? 0) > 0;
}

/* The chat's code sandbox session (null when it has none). */
export async function getSandboxId(q: Queryable, userId: string, id: string): Promise<string | null> {
  const { rows } = await q.query<{ sandboxId: string | null }>(`select "sandboxId" from agent_conversation where id = $1 and "userId" = $2`, [id, userId]);
  return rows[0]?.sandboxId ?? null;
}

export async function setSandboxId(q: Queryable, userId: string, id: string, sandboxId: string | null): Promise<void> {
  await q.query(`update agent_conversation set "sandboxId" = $3 where id = $1 and "userId" = $2`, [id, userId, sandboxId]);
}

/* Web search on or off for this chat (the + menu). */
export async function setWebSearch(q: Queryable, userId: string, id: string, on: boolean): Promise<void> {
  await q.query(`update agent_conversation set "webSearch" = $3 where id = $1 and "userId" = $2`, [id, userId, on]);
}

export async function setModel(q: Queryable, userId: string, id: string, model: string): Promise<void> {
  await q.query(`update agent_conversation set model = $3 where id = $1 and "userId" = $2`, [id, userId, model]);
}

/* Claim the conversation for one reply (false when another is still running). */
export async function claimRun(q: Queryable, userId: string, id: string, forS: number): Promise<boolean> {
  const { rowCount } = await q.query(
    `update agent_conversation set "runningUntil" = now() + make_interval(secs => $3)
     where id = $1 and "userId" = $2 and ("runningUntil" is null or "runningUntil" < now())`,
    [id, userId, forS],
  );
  return (rowCount ?? 0) > 0;
}

export async function releaseRun(q: Queryable, id: string): Promise<void> {
  await q.query(`update agent_conversation set "runningUntil" = null where id = $1`, [id]);
}

export async function setPending(q: Queryable, id: string, pending: Pending | null): Promise<void> {
  await q.query(`update agent_conversation set pending = $2, "updatedAt" = now() where id = $1`, [id, pending ? JSON.stringify(pending) : null]);
}

/* Add messages at the end, and their cost to the conversation's total. Returns their numbers. */
export async function appendMessages(db: Db, conversationId: string, messages: StoredMessage[]): Promise<number[]> {
  if (!messages.length) return [];
  const seqs: number[] = [];
  await tx(db, async (q) => {
    const { rows } = await q.query<{ n: number }>(`select coalesce(max(seq), 0) as n from agent_message where "conversationId" = $1`, [conversationId]);
    let seq = Number(rows[0].n);
    let cost = 0;
    for (const m of messages) {
      cost += m.costUsd ?? 0;
      seqs.push(++seq);
      const values = [conversationId, seq, m.message.role, JSON.stringify(m.message), m.ui ? JSON.stringify(m.ui) : null, m.costUsd ?? 0];
      // the reader's meta column exists once its tables are migrated; plain chats never need it
      if (m.meta) await q.query(`insert into agent_message ("conversationId", seq, role, content, ui, "costUsd", meta) values ($1, $2, $3, $4, $5, $6, $7)`, [...values, JSON.stringify(m.meta)]);
      else await q.query(`insert into agent_message ("conversationId", seq, role, content, ui, "costUsd") values ($1, $2, $3, $4, $5, $6)`, values);
    }
    await q.query(`update agent_conversation set "costUsd" = "costUsd" + $2, "updatedAt" = now() where id = $1`, [conversationId, cost]);
  });
  return seqs;
}

/* upTo: only the messages up to this one (a shared link's snapshot) */
export async function loadMessages(q: Queryable, conversationId: string, upTo?: number): Promise<StoredMessage[]> {
  const { rows } = await q.query<{ seq: number; content: ChatMessage; ui: StepView[] | null; costUsd: number; createdAt: Date; feedback?: Feedback | null; meta?: MessageMeta | null }>(
    upTo === undefined ? `select * from agent_message where "conversationId" = $1 order by seq` : `select * from agent_message where "conversationId" = $1 and seq <= $2 order by seq`,
    upTo === undefined ? [conversationId] : [conversationId, upTo],
  );
  return rows.map((r) => ({
    message: r.content,
    ui: r.ui,
    costUsd: Number(r.costUsd),
    seq: Number(r.seq),
    createdAt: iso(r.createdAt)!,
    ...(r.feedback ? { feedback: r.feedback } : {}),
    ...(r.meta ? { meta: r.meta } : {}),
  }));
}

/* The user's thumbs up or down on one of their answers (null takes it back). */
export async function setFeedback(q: Queryable, userId: string, conversationId: string, seq: number, feedback: Feedback | null): Promise<boolean> {
  const { rowCount } = await q.query(
    `update agent_message m set feedback = $4 from agent_conversation c
     where c.id = m."conversationId" and c."userId" = $2 and m."conversationId" = $1 and m.seq = $3 and m.role = 'assistant'`,
    [conversationId, userId, seq, feedback],
  );
  return (rowCount ?? 0) > 0;
}

/* Try again: drop everything after the user's last message, so the answer to it can be asked for afresh. False when there is no such message. */
export async function dropAfterLastUserMessage(q: Queryable, userId: string, conversationId: string): Promise<boolean> {
  const { rows } = await q.query<{ last: number | null }>(
    `select max(m.seq) as last from agent_message m join agent_conversation c on c.id = m."conversationId" where m."conversationId" = $1 and c."userId" = $2 and m.role = 'user'`,
    [conversationId, userId],
  );
  const last = rows[0]?.last;
  if (last == null) return false;
  await q.query(`delete from agent_message where "conversationId" = $1 and seq > $2`, [conversationId, last]);
  return true;
}
