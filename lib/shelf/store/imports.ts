import { randomUUID } from 'node:crypto';
import { iso, type Queryable } from '../db';
import type { ImportEntry, ParsedFile } from '../import/types';

/* Imports and their entries. Reads are scoped to the user; the worker
   functions (claim, pending, settle) are used by the background runner. */

export type EntryStatus = 'pending' | 'matched' | 'added' | 'duplicate' | 'failed';
export type ImportSummary = {
  id: string;
  fileName: string;
  format: string;
  projectId: string | null;
  status: 'queued' | 'done';
  total: number;
  counts: Record<EntryStatus, number>;
  failed: { label: string; reason: string }[];
  createdAt: string;
  finishedAt: string | null;
};

const BATCH_INSERT = 500;

export async function createImport(q: Queryable, userId: string, f: { fileName: string; projectId: string | null; parsed: ParsedFile }): Promise<string> {
  const id = `im_${randomUUID()}`;
  const total = f.parsed.entries.length + f.parsed.failed.length;
  await q.query(`insert into shelf_import (id, "userId", "fileName", format, "projectId", total) values ($1, $2, $3, $4, $5, $6)`, [id, userId, f.fileName, f.parsed.format, f.projectId, total]);
  const rows: { idx: number; label: string; data: ImportEntry | null; status: EntryStatus; reason: string | null }[] = [
    ...f.parsed.entries.map((e, i) => ({ idx: i, label: e.label, data: e, status: 'pending' as const, reason: null })),
    ...f.parsed.failed.map((e, i) => ({ idx: f.parsed.entries.length + i, label: e.label, data: null, status: 'failed' as const, reason: e.reason })),
  ];
  for (let i = 0; i < rows.length; i += BATCH_INSERT) {
    const chunk = rows.slice(i, i + BATCH_INSERT);
    await q.query(
      `insert into shelf_import_entry ("importId", idx, label, data, status, reason)
       select $1, x.idx, x.label, x.data, x.status, x.reason from jsonb_to_recordset($2::jsonb) as x(idx integer, label text, data jsonb, status text, reason text)`,
      [id, JSON.stringify(chunk)],
    );
  }
  return id;
}

export async function getImport(q: Queryable, userId: string, id: string): Promise<ImportSummary | null> {
  const { rows } = await q.query(`select id, "fileName", format, "projectId", status, total, "createdAt", "finishedAt" from shelf_import where "userId" = $1 and id = $2`, [userId, id]);
  if (!rows[0]) return null;
  const counts = await q.query<{ status: EntryStatus; n: string }>(`select status, count(*) as n from shelf_import_entry where "importId" = $1 group by status`, [id]);
  const failed = await q.query<{ label: string; reason: string }>(`select label, coalesce(reason, 'Could not be added') as reason from shelf_import_entry where "importId" = $1 and status = 'failed' order by idx limit 500`, [id]);
  const c: Record<EntryStatus, number> = { pending: 0, matched: 0, added: 0, duplicate: 0, failed: 0 };
  for (const r of counts.rows) c[r.status] = Number(r.n);
  const r = rows[0];
  return {
    id: r.id,
    fileName: r.fileName,
    format: r.format,
    projectId: r.projectId,
    status: r.status,
    total: r.total,
    counts: c,
    failed: failed.rows,
    createdAt: iso(r.createdAt) as string,
    finishedAt: iso(r.finishedAt),
  };
}

export async function recentImports(q: Queryable, userId: string): Promise<{ id: string; fileName: string; status: string; total: number; createdAt: string }[]> {
  const { rows } = await q.query(`select id, "fileName", status, total, "createdAt" from shelf_import where "userId" = $1 order by "createdAt" desc limit 10`, [userId]);
  return rows.map((r) => ({ ...r, createdAt: iso(r.createdAt) as string })) as never;
}

/* ---------- worker ---------- */

export type ClaimedImport = { id: string; userId: string; projectId: string | null; lookupFailures: number };

/* Lock one queued import (a given one, or the oldest) for a while; null if busy or none. */
export async function claimImport(q: Queryable, opts: { id?: string; userId?: string; lockS: number }): Promise<ClaimedImport | null> {
  const { rows } = await q.query<ClaimedImport>(
    `update shelf_import set "lockedUntil" = now() + make_interval(secs => $3)
     where id = (
       select id from shelf_import
       where status = 'queued' and ("lockedUntil" is null or "lockedUntil" < now())
         and ($1::text is null or id = $1) and ($2::text is null or "userId" = $2)
       order by "createdAt" limit 1 for update skip locked)
     returning id, "userId", "projectId", "lookupFailures"`,
    [opts.id ?? null, opts.userId ?? null, opts.lockS],
  );
  return rows[0] ?? null;
}

export async function releaseImport(q: Queryable, id: string): Promise<void> {
  await q.query(`update shelf_import set "lockedUntil" = null where id = $1`, [id]);
}

export async function pendingEntries(q: Queryable, importId: string, limit: number): Promise<{ idx: number; data: ImportEntry }[]> {
  const { rows } = await q.query(`select idx, data from shelf_import_entry where "importId" = $1 and status = 'pending' order by idx limit $2`, [importId, limit]);
  return rows as never;
}

export async function settleEntry(q: Queryable, importId: string, idx: number, status: EntryStatus, f: { reason?: string | null; itemId?: string | null } = {}): Promise<void> {
  await q.query(`update shelf_import_entry set status = $3, reason = $4, "itemId" = $5 where "importId" = $1 and idx = $2`, [importId, idx, status, f.reason ?? null, f.itemId ?? null]);
}

export async function noteLookupFailure(q: Queryable, importId: string): Promise<number> {
  const { rows } = await q.query<{ n: number }>(`update shelf_import set "lookupFailures" = "lookupFailures" + 1 where id = $1 returning "lookupFailures" as n`, [importId]);
  return rows[0]?.n ?? 0;
}

export async function finishImport(q: Queryable, importId: string): Promise<void> {
  await q.query(`update shelf_import set status = 'done', "finishedAt" = now(), "lockedUntil" = null where id = $1`, [importId]);
}

/* Finished imports are kept a month for their summaries. */
export async function deleteOldImports(q: Queryable): Promise<number> {
  const { rowCount } = await q.query(`delete from shelf_import where status = 'done' and "finishedAt" < now() - interval '30 days'`);
  return rowCount ?? 0;
}
