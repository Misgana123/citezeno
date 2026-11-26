import { randomUUID } from 'node:crypto';
import { iso, tx, type Db, type Queryable } from '@/lib/shelf/db';
import type { Passage } from '../text';

/* Papers' text (reader_text) and its passages (reader_passage). A text is
   either shared (one per paper, from a reusable open-access copy or one only
   streamed) or a user's (one per uploaded PDF). */

export type TextStatus = 'pending' | 'processing' | 'ready' | 'no_text' | 'failed';
export type TextStage = 'extract' | 'embed' | 'done';

export type TextRow = {
  id: string;
  paperId: string;
  scope: 'shared' | 'user';
  ownerId: string | null;
  pdfId: string | null;
  sourceUrl: string | null;
  storageKey: string | null;
  license: string | null;
  title: string | null;
  status: TextStatus;
  stage: TextStage;
  pageCount: number | null;
  tokenCount: number | null;
  embeddingModel: string | null;
  embeddingDims: number | null;
  error: string | null;
  attempts: number;
  processedAt: string | null;
};

const COLS = `id, "paperId", scope, "ownerId", "pdfId", "sourceUrl", "storageKey", license, title, status, stage, "pageCount", "tokenCount", "embeddingModel", "embeddingDims", error, attempts, "processedAt"`;
const toRow = (r: Record<string, unknown>): TextRow => ({ ...(r as unknown as TextRow), processedAt: iso(r.processedAt as Date | null) });

export async function getText(q: Queryable, id: string): Promise<TextRow | null> {
  const { rows } = await q.query(`select ${COLS} from reader_text where id = $1`, [id]);
  return rows[0] ? toRow(rows[0]) : null;
}

export async function getSharedText(q: Queryable, paperId: string): Promise<TextRow | null> {
  const { rows } = await q.query(`select ${COLS} from reader_text where scope = 'shared' and "paperId" = $1`, [paperId]);
  return rows[0] ? toRow(rows[0]) : null;
}

/* A user's text for one of their uploads (only theirs). */
export async function getUploadText(q: Queryable, userId: string, pdfId: string): Promise<TextRow | null> {
  const { rows } = await q.query(`select ${COLS} from reader_text where "pdfId" = $1 and "ownerId" = $2`, [pdfId, userId]);
  return rows[0] ? toRow(rows[0]) : null;
}

/* The shared text for a paper's open-access PDF, made on first open. A changed
   link (the provider found a better copy) starts it over. */
export async function ensureSharedText(q: Queryable, f: { paperId: string; sourceUrl: string; license: string | null; title: string }): Promise<TextRow> {
  await q.query(
    `insert into reader_text (id, "paperId", scope, "sourceUrl", license, title) values ($1, $2, 'shared', $3, $4, $5)
     on conflict ("paperId") where scope = 'shared' do update set "lastOpenedAt" = now(), title = excluded.title`,
    [`t_${randomUUID()}`, f.paperId, f.sourceUrl, f.license, f.title],
  );
  const row = (await getSharedText(q, f.paperId))!;
  if (row.sourceUrl !== f.sourceUrl && row.status !== 'ready') {
    await q.query(`update reader_text set "sourceUrl" = $2, license = $3, status = 'pending', stage = 'extract', error = null, attempts = 0 where id = $1`, [row.id, f.sourceUrl, f.license]);
    return (await getText(q, row.id))!;
  }
  return row;
}

/* The text for one of the user's uploads, made on first open. */
export async function ensureUploadText(q: Queryable, f: { userId: string; pdfId: string; paperId: string; title: string }): Promise<TextRow> {
  await q.query(
    `insert into reader_text (id, "paperId", scope, "ownerId", "pdfId", title) values ($1, $2, 'user', $3, $4, $5)
     on conflict ("pdfId") where "pdfId" is not null do update set "lastOpenedAt" = now()`,
    [`t_${randomUUID()}`, f.paperId, f.userId, f.pdfId, f.title],
  );
  return (await getUploadText(q, f.userId, f.pdfId))!;
}

/* Most attempts before a text is left as failed (a retry from the reader starts over). */
export const MAX_ATTEMPTS = 3;

/* Take one text that needs work, for lockS seconds: extracting first, then
   embedding (only when embeddings are set up). One worker per text. */
export async function claimWork(q: Queryable, opts: { canEmbed: boolean; lockS: number; id?: string }): Promise<TextRow | null> {
  const { rows } = await q.query(
    `update reader_text set "lockedUntil" = now() + make_interval(secs => $1), attempts = attempts + 1,
       status = case when status = 'pending' then 'processing' else status end
     where id = (
       select id from reader_text
       where ($3::text is null or id = $3)
         and status not in ('failed', 'no_text')
         and (stage = 'extract' or (stage = 'embed' and $2))
         and attempts < ${MAX_ATTEMPTS}
         and ("lockedUntil" is null or "lockedUntil" < now())
       order by "createdAt" limit 1 for update skip locked)
     returning ${COLS}`,
    [opts.lockS, opts.canEmbed, opts.id ?? null],
  );
  return rows[0] ? toRow(rows[0]) : null;
}

export async function release(q: Queryable, id: string): Promise<void> {
  await q.query(`update reader_text set "lockedUntil" = null where id = $1`, [id]);
}

/* The shared open-access copy is stored now (reusable licenses only). */
export async function setStored(q: Queryable, id: string, storageKey: string): Promise<void> {
  await q.query(`update reader_text set "storageKey" = $2 where id = $1`, [id, storageKey]);
}

export async function markNoText(q: Queryable, id: string, pageCount: number): Promise<void> {
  await q.query(`update reader_text set status = 'no_text', stage = 'done', "pageCount" = $2, "processedAt" = now(), "lockedUntil" = null, error = null where id = $1`, [id, pageCount]);
}

/* Give up on a text, with why ("download:not_pdf", "unreadable"…). Out of attempts → failed. */
export async function markFailed(q: Queryable, id: string, error: string, final: boolean): Promise<void> {
  await q.query(
    `update reader_text set error = $2, "lockedUntil" = null, status = case when $3 or attempts >= ${MAX_ATTEMPTS} then 'failed' else status end where id = $1`,
    [id, error.slice(0, 200), final],
  );
}

/* Start a failed text over (the reader's "Try again"). */
export async function retryText(q: Queryable, id: string): Promise<void> {
  await q.query(`update reader_text set status = 'pending', stage = 'extract', attempts = 0, error = null, "lockedUntil" = null where id = $1 and status = 'failed'`, [id]);
}

/* Replace the text's passages; the text is readable now, and waits for embeddings. */
export async function saveExtracted(db: Db, id: string, f: { passages: Passage[]; pageCount: number; tokenCount: number; next: TextStage }): Promise<void> {
  await tx(db, async (q) => {
    await q.query(`delete from reader_passage where "textId" = $1`, [id]);
    for (let i = 0; i < f.passages.length; i += 200) {
      const slice = f.passages.slice(i, i + 200);
      const values: unknown[] = [];
      const rows = slice.map((p, j) => {
        values.push(id, p.id, p.ord, p.page, p.section, p.isReferences, p.text, p.tokens, JSON.stringify(p.box));
        const b = j * 9;
        return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9}::jsonb)`;
      });
      await q.query(`insert into reader_passage ("textId", id, ord, page, section, "isReferences", text, tokens, box) values ${rows.join(', ')}`, values);
    }
    await q.query(
      `update reader_text set status = 'ready', stage = $4, "pageCount" = $2, "tokenCount" = $3, "embeddingModel" = null, "embeddingDims" = null,
         "processedAt" = now(), error = null, attempts = 0, "lockedUntil" = null where id = $1`,
      [id, f.pageCount, f.tokenCount, f.next],
    );
  });
}

/* Embeddings done for this model and size: search by meaning works. */
export async function markEmbedded(q: Queryable, id: string, model: string, dims: number): Promise<void> {
  await q.query(`update reader_text set stage = 'done', "embeddingModel" = $2, "embeddingDims" = $3, attempts = 0, error = null, "lockedUntil" = null where id = $1`, [id, model, dims]);
}

/* Not enough credits to embed a user's upload: done without vectors (questions
   use keyword search). Opening the paper again queues it once more. */
export const NO_CREDITS = 'no_credits';
export async function markKeywordsOnly(q: Queryable, id: string): Promise<void> {
  await q.query(`update reader_text set stage = 'done', error = $2, attempts = 0, "lockedUntil" = null where id = $1`, [id, NO_CREDITS]);
}

export async function requeueKeywordsOnly(q: Queryable, id: string): Promise<boolean> {
  const r = await q.query(`update reader_text set stage = 'embed', error = null where id = $1 and error = $2 and status = 'ready'`, [id, NO_CREDITS]);
  return Boolean(r.rowCount);
}

/* Texts embedded with another model or size go back to the embedding step. Their
   old vectors are dropped, so until they are redone questions use keyword search. */
export async function queueReembedding(db: Db, model: string, dims: number, limit = 50): Promise<number> {
  return tx(db, async (q) => {
    const { rows } = await q.query<{ id: string }>(
      `update reader_text set stage = 'embed', "embeddingModel" = null, "embeddingDims" = null, attempts = 0
       where id in (select id from reader_text where stage = 'done' and status = 'ready' and error is distinct from 'no_credits' and ("embeddingModel" is distinct from $1 or "embeddingDims" is distinct from $2) limit $3)
       returning id`,
      [model, dims, limit],
    );
    if (rows.length && (await hasEmbeddingColumn(q))) await q.query(`update reader_passage set embedding = null where "textId" = any($1)`, [rows.map((r) => r.id)]);
    return rows.length;
  });
}

export async function hasEmbeddingColumn(q: Queryable): Promise<boolean> {
  const { rows } = await q.query(`select 1 from information_schema.columns where table_name = 'reader_passage' and column_name = 'embedding' and table_schema = current_schema()`);
  return rows.length > 0;
}

/* Shared open-access copies nobody has opened for `days`: their files can go
   (they are fetched again on the next open); the text and passages stay. */
export async function staleSharedCopies(q: Queryable, days: number, limit = 50): Promise<{ id: string; storageKey: string }[]> {
  const { rows } = await q.query<{ id: string; storageKey: string }>(
    `select id, "storageKey" from reader_text where scope = 'shared' and "storageKey" is not null and "lastOpenedAt" < now() - make_interval(days => $1) limit $2`,
    [days, limit],
  );
  return rows;
}

export async function forgetStoredCopy(q: Queryable, id: string): Promise<void> {
  await q.query(`update reader_text set "storageKey" = null where id = $1`, [id]);
}
