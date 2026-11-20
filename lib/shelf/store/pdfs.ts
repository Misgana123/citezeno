import { randomUUID } from 'node:crypto';
import { iso, type Queryable } from '../db';
import type { PdfTextStatus } from '../types';

/* Uploaded PDFs (shelf_pdf). Every function is scoped to one user. Deleting a
   row queues its file for removal from storage (a database trigger). */

export type PdfFound = { doi: string | null; title: string | null };
export type PdfRow = {
  id: string;
  itemId: string | null;
  storageKey: string;
  fileName: string;
  sizeBytes: number;
  pageCount: number | null;
  status: 'uploading' | 'ready';
  textStatus: PdfTextStatus;
  found: PdfFound | null;
  uploadedAt: string;
};

const COLS = `id, "itemId", "storageKey", "fileName", "sizeBytes", "pageCount", status, "textStatus", found, "uploadedAt"`;
const toRow = (r: Record<string, unknown>): PdfRow => ({ ...(r as unknown as PdfRow), sizeBytes: Number(r.sizeBytes), uploadedAt: iso(r.uploadedAt as Date) as string });

/* A PDF about to be uploaded. Its storage key names the user, so a whole
   account's files sit together. */
export async function createPending(q: Queryable, userId: string, f: { fileName: string; sizeBytes: number; itemId?: string | null }): Promise<PdfRow> {
  const id = `f_${randomUUID()}`;
  const { rows } = await q.query(
    `insert into shelf_pdf (id, "userId", "itemId", "storageKey", "fileName", "sizeBytes") values ($1, $2, $3, $4, $5, $6) returning ${COLS}`,
    [id, userId, f.itemId ?? null, `shelf/${userId}/${id}.pdf`, f.fileName, f.sizeBytes],
  );
  return toRow(rows[0]);
}

export async function getPdfRow(q: Queryable, userId: string, id: string): Promise<PdfRow | null> {
  const { rows } = await q.query(`select ${COLS} from shelf_pdf where "userId" = $1 and id = $2`, [userId, id]);
  return rows[0] ? toRow(rows[0]) : null;
}

export async function markReady(
  q: Queryable,
  userId: string,
  id: string,
  f: { sizeBytes: number; pageCount: number | null; textStatus: PdfTextStatus; text: string | null; found: PdfFound },
): Promise<PdfRow | null> {
  const { rows } = await q.query(
    `update shelf_pdf set status = 'ready', "sizeBytes" = $3, "pageCount" = $4, "textStatus" = $5, "text" = $6, found = $7,
       tsv = case when $6::text is null then null else to_tsvector('simple', left($6::text, 400000)) end
     where "userId" = $1 and id = $2 returning ${COLS}`,
    [userId, id, f.sizeBytes, f.pageCount, f.textStatus, f.text, JSON.stringify(f.found)],
  );
  return rows[0] ? toRow(rows[0]) : null;
}

/* Put a PDF on one of the user's own items. */
export async function attachPdf(q: Queryable, userId: string, id: string, itemId: string): Promise<boolean> {
  const { rowCount } = await q.query(
    `update shelf_pdf set "itemId" = $3 where "userId" = $1 and id = $2 and exists (select 1 from shelf_item where id = $3 and "userId" = $1)`,
    [userId, id, itemId],
  );
  return (rowCount ?? 0) > 0;
}

export async function deletePdf(q: Queryable, userId: string, id: string): Promise<boolean> {
  const { rowCount } = await q.query(`delete from shelf_pdf where "userId" = $1 and id = $2`, [userId, id]);
  return (rowCount ?? 0) > 0;
}

/* Bytes the user's PDFs take (uploads in progress count at their stated size). */
export async function storageUsed(q: Queryable, userId: string): Promise<number> {
  const { rows } = await q.query<{ n: string | null }>(`select sum("sizeBytes") as n from shelf_pdf where "userId" = $1`, [userId]);
  return Number(rows[0].n ?? 0);
}

/* Every PDF of the user's, newest first, with the paper it belongs to (its ID opens it in the reader). */
export async function listPdfs(q: Queryable, userId: string): Promise<(PdfRow & { paperTitle: string | null; paperId: string | null })[]> {
  const { rows } = await q.query(
    `select ${COLS.split(', ').map((c) => `f.${c}`).join(', ')}, p.title as "paperTitle", p.id as "paperId"
     from shelf_pdf f left join shelf_item i on i.id = f."itemId" left join shelf_paper p on p.id = i."paperId"
     where f."userId" = $1 and f.status = 'ready' order by f."uploadedAt" desc limit 1000`,
    [userId],
  );
  return rows.map((r) => ({ ...toRow(r), paperTitle: (r.paperTitle as string) ?? null, paperId: (r.paperId as string) ?? null }));
}

/* A merge keeps every PDF: move them from one item to the other. */
export async function movePdfs(q: Queryable, userId: string, fromItemId: string, toItemId: string): Promise<void> {
  await q.query(`update shelf_pdf set "itemId" = $3 where "userId" = $1 and "itemId" = $2`, [userId, fromItemId, toItemId]);
}

/* Uploads that never finished (a day), and PDFs never matched to a paper (a week). */
export async function deleteAbandoned(q: Queryable): Promise<number> {
  const { rowCount } = await q.query(
    `delete from shelf_pdf where (status = 'uploading' and "uploadedAt" < now() - interval '1 day')
       or (status = 'ready' and "itemId" is null and "uploadedAt" < now() - interval '7 days')`,
  );
  return rowCount ?? 0;
}

/* ---------- storage trash ---------- */

export async function takeTrash(q: Queryable, limit: number): Promise<string[]> {
  const { rows } = await q.query<{ key: string }>(`select key from shelf_storage_trash where attempts < 20 order by "createdAt" limit $1`, [limit]);
  return rows.map((r) => r.key);
}

export async function settleTrash(q: Queryable, removed: string[], failed: string[]): Promise<void> {
  if (removed.length) await q.query(`delete from shelf_storage_trash where key = any($1)`, [removed]);
  if (failed.length) await q.query(`update shelf_storage_trash set attempts = attempts + 1 where key = any($1)`, [failed]);
}
