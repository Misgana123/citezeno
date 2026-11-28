import { randomBytes } from 'node:crypto';
import { iso, type Queryable } from '@/lib/shelf/db';
import type { ShelfItem } from '@/lib/shelf/types';
import { siteURL } from '@/lib/site';
import { loadMessages } from './store';
import type { ToolDisplay } from './tools/types';
import type { StepView, StoredMessage } from './types';
import { toView, type ChatEntry } from './view';

/* Sharing a chat: a read-only public link (/c/<token>) to the conversation as
   it was when shared. Messages sent later stay private until the owner
   updates the link, and stopping it makes the link stop working at once.
   The public page shows the words and what the steps found, never the
   user's attached files, the files made for them, shelf notes or step inputs. */

export type ChatShare =
  | { shared: false }
  | {
      shared: true;
      url: string;
      /* when the link was made or last updated */
      sharedAt: string;
      views: number;
      /* the chat has messages the link doesn't show yet */
      behind: boolean;
    };

/* A shared chat as the public page shows it. */
export type SharedChat = { title: string; owner: string | null; sharedAt: string; entries: ChatEntry[] };

export const SHARE_TOKEN = /^[\w-]{12,40}$/;
export const shareUrl = (token: string) => `${siteURL}/c/${token}`;

type ShareRow = { shareToken: string | null; sharedAt: Date | null; shareViews: number; shareSeq: number | null; last: number | null };

const state = (r: ShareRow): ChatShare =>
  r.shareToken ? { shared: true, url: shareUrl(r.shareToken), sharedAt: iso(r.sharedAt)!, views: Number(r.shareViews), behind: Number(r.last ?? 0) > Number(r.shareSeq ?? 0) } : { shared: false };

const LAST = `(select coalesce(max(seq), 0) from agent_message m where m."conversationId" = c.id)`;
const COLS = `c."shareToken", c."sharedAt", c."shareViews", c."shareSeq", ${LAST} as last`;

/* Is this chat shared, and is the link up to date? null: no such chat of this user. */
export async function shareState(q: Queryable, userId: string, id: string): Promise<ChatShare | null> {
  const { rows } = await q.query<ShareRow>(`select ${COLS} from agent_conversation c where c.id = $1 and c."userId" = $2`, [id, userId]);
  return rows[0] ? state(rows[0]) : null;
}

/* Make the link, or bring it up to date: it then shows every message so far.
   The address stays the same, so a link already sent keeps working. */
export async function shareConversation(q: Queryable, userId: string, id: string): Promise<ChatShare | null> {
  const { rows } = await q.query<ShareRow>(
    `update agent_conversation c set "shareToken" = coalesce(c."shareToken", $3), "shareSeq" = ${LAST}, "sharedAt" = now()
     where c.id = $1 and c."userId" = $2 returning ${COLS}`,
    [id, userId, randomBytes(15).toString('base64url')],
  );
  return rows[0] ? state(rows[0]) : null;
}

/* Stop sharing: the old link stops working, and a new one starts afresh. */
export async function unshareConversation(q: Queryable, userId: string, id: string): Promise<boolean> {
  const { rowCount } = await q.query(`update agent_conversation set "shareToken" = null, "shareSeq" = null, "sharedAt" = null, "shareViews" = 0 where id = $1 and "userId" = $2`, [id, userId]);
  return (rowCount ?? 0) > 0;
}

/* A shared chat by its link, as far as it was shared (null: no such link). */
export async function openSharedChat(q: Queryable, token: string): Promise<SharedChat | null> {
  if (!SHARE_TOKEN.test(token)) return null;
  const { rows } = await q.query<{ id: string; title: string; sharedAt: Date; shareSeq: number; owner: string | null }>(
    `select c.id, c.title, c."sharedAt", c."shareSeq", u.name as owner from agent_conversation c join "user" u on u.id = c."userId" where c."shareToken" = $1`,
    [token],
  );
  const r = rows[0];
  if (!r) return null;
  const messages = await loadMessages(q, r.id, Number(r.shareSeq ?? 0));
  return { title: r.title, owner: r.owner, sharedAt: iso(r.sharedAt)!, entries: publicEntries(messages) };
}

/* Count a visit to a shared chat. */
export async function countShareView(q: Queryable, token: string): Promise<void> {
  await q.query(`update agent_conversation set "shareViews" = "shareViews" + 1 where "shareToken" = $1`, [token]);
}

/* What a step shows the public: what it found, never its input, the files it
   made or the shelf details of saved papers (only the papers themselves). */
function publicDisplay(d: ToolDisplay): ToolDisplay {
  const { file: _file, files: _files, research: _research, items, ...rest } = d;
  return {
    ...rest,
    ...(items?.length
      ? { items: items.map((i): ShelfItem => ({ id: i.id, paper: i.paper, addedAt: i.addedAt, addedVia: i.addedVia, readingStatus: 'to_read', note: null, projectIds: [], folderIds: [], tagIds: [], pdfs: [], reading: null })) }
      : {}),
  };
}

function publicStep(s: StepView): StepView {
  return {
    callId: s.callId,
    name: s.name,
    label: s.label,
    input: {},
    status: s.status,
    ...(s.error ? { error: s.error } : {}),
    ...(s.kind ? { kind: s.kind } : {}),
    ...(s.line ? { line: s.line } : {}),
    ...(s.part != null ? { part: s.part } : {}),
    ...(s.display ? { display: publicDisplay(s.display) } : {}),
  };
}

/* A conversation's messages as the public page shows them: attachments by name only. */
export function publicEntries(messages: StoredMessage[]): ChatEntry[] {
  const now = new Date(0).toISOString();
  const { entries } = toView({ id: '', title: '', model: '', pinned: false, webSearch: false, pending: null, costUsd: 0, createdAt: now, updatedAt: now, ownerId: '', labId: null, projectId: null }, messages);
  return entries.map((e) =>
    e.kind === 'user'
      ? { kind: 'user', text: e.text, ...(e.attachments?.length ? { attachments: e.attachments.map((a) => ({ kind: a.kind, name: a.name })) } : {}) }
      : e.kind === 'steps'
        ? { kind: 'steps', steps: e.steps.map(publicStep) }
        : { kind: 'assistant', text: e.text },
  );
}
