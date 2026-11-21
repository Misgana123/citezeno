import { randomUUID } from 'node:crypto';
import type { FileStore } from '@/lib/providers/storage/types';
import type { Db, Queryable } from '@/lib/shelf/db';
import { ShelfError } from '@/lib/shelf/errors';

/* Files the assistant makes (documents, charts…): kept in file storage under
   the user and conversation, listed in agent_file, and handed to their owner
   only through short-lived signed links. Deleting the conversation (or the
   account) deletes the rows; the stored files go to the storage trash. */

/* Largest file one step may make, and the most files one conversation keeps. */
export const AGENT_FILE_MAX_BYTES = 20 * 1024 * 1024;
export const AGENT_FILES_PER_CONVERSATION = 100;
/* How long a download link works. */
export const AGENT_FILE_LINK_TTL_S = 300;

/* A made file as the chat shows it (the bytes stay in storage). */
export type AgentFileRef = { id: string; name: string; mime: string; size: number };

export type AgentFileRow = AgentFileRef & { storageKey: string; conversationId: string };

/* What a tool may do with files: save one it made for this conversation, or
   read back one this user's assistant made (null when it isn't theirs or is gone). */
export type AgentFiles = {
  save(f: { name: string; mime: string; bytes: Uint8Array }): Promise<AgentFileRef>;
  read(id: string): Promise<{ file: AgentFileRef; bytes: Uint8Array } | null>;
};

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'text/csv': 'csv',
  'text/markdown': 'md',
  'text/plain': 'txt',
  'application/json': 'json',
};

/* A safe file name that ends in the type's extension: "Report.docx". */
export function agentFileName(name: string, mime: string): string {
  const ext = EXTENSIONS[mime];
  const base =
    (name.split(/[\\/]/).pop() ?? '')
      .replace(/[\u0000-\u001f\u007f"<>|:*?]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160) || 'file';
  if (!ext) return base;
  return base.toLowerCase().endsWith(`.${ext}`) ? base : `${base.replace(/\.[a-z0-9]{1,5}$/i, '')}.${ext}`;
}

const mb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;
const COLS = `id, "conversationId", "storageKey", name, mime, "sizeBytes"`;
const toRow = (r: Record<string, unknown>): AgentFileRow => ({
  id: r.id as string,
  conversationId: r.conversationId as string,
  storageKey: r.storageKey as string,
  name: r.name as string,
  mime: r.mime as string,
  size: Number(r.sizeBytes),
});
export const fileRef = ({ id, name, mime, size }: AgentFileRow): AgentFileRef => ({ id, name, mime, size });

export async function getAgentFile(q: Queryable, userId: string, id: string): Promise<AgentFileRow | null> {
  const { rows } = await q.query(`select ${COLS} from agent_file where id = $1 and "userId" = $2`, [id, userId]);
  return rows[0] ? toRow(rows[0]) : null;
}

/* Store a made file and list it under the conversation. */
export async function saveAgentFile(
  deps: { db: Db; store: FileStore | null },
  owner: { userId: string; conversationId: string },
  f: { name: string; mime: string; bytes: Uint8Array },
): Promise<AgentFileRef> {
  if (!deps.store) throw new ShelfError('unavailable', 'Saving files isn’t set up yet. Please try again later.');
  if (f.bytes.byteLength > AGENT_FILE_MAX_BYTES) throw new ShelfError('too_large', `This file is over the ${mb(AGENT_FILE_MAX_BYTES)} limit.`, { limit: AGENT_FILE_MAX_BYTES });
  const { rows } = await deps.db.query<{ n: number }>(`select count(*)::int as n from agent_file where "conversationId" = $1`, [owner.conversationId]);
  if (Number(rows[0].n) >= AGENT_FILES_PER_CONVERSATION)
    throw new ShelfError('user_limit', `This chat already has ${AGENT_FILES_PER_CONVERSATION} files. Start a new chat to make more.`, { limit: AGENT_FILES_PER_CONVERSATION });

  const id = `af_${randomUUID()}`;
  const name = agentFileName(f.name, f.mime);
  const ext = EXTENSIONS[f.mime] ?? 'bin';
  const storageKey = `agent/${owner.userId}/${owner.conversationId}/${id}.${ext}`;
  await deps.store.write(storageKey, f.bytes, f.mime);
  try {
    await deps.db.query(`insert into agent_file (id, "userId", "conversationId", "storageKey", name, mime, "sizeBytes") values ($1, $2, $3, $4, $5, $6, $7)`, [
      id,
      owner.userId,
      owner.conversationId,
      storageKey,
      name,
      f.mime,
      f.bytes.byteLength,
    ]);
  } catch (e) {
    // the conversation was deleted meanwhile (or the insert failed): don't leave the stored file behind
    await deps.store.remove(storageKey).catch(() => {});
    throw e;
  }
  return { id, name, mime: f.mime, size: f.bytes.byteLength };
}

/* A made file's bytes, for its owner. */
export async function readAgentFile(deps: { db: Db; store: FileStore | null }, userId: string, id: string): Promise<{ file: AgentFileRef; bytes: Uint8Array } | null> {
  if (!deps.store) throw new ShelfError('unavailable', 'Reading files isn’t set up yet. Please try again later.');
  const row = await getAgentFile(deps.db, userId, id);
  if (!row) return null;
  const bytes = await deps.store.read(row.storageKey, AGENT_FILE_MAX_BYTES);
  return bytes ? { file: fileRef(row), bytes } : null;
}

/* The file service one reply's tools use. */
export const agentFiles = (deps: { db: Db; store: FileStore | null }, owner: { userId: string; conversationId: string }): AgentFiles => ({
  save: (f) => saveAgentFile(deps, owner, f),
  read: (id) => readAgentFile(deps, owner.userId, id),
});
