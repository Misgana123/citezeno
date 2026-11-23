import type { Paper } from '../types';
import type { Queryable } from './types';

/* Keeping the copy of papers in shape, for the background jobs (Postgres only;
   tests run the same SQL in a throwaway schema). */

/* Kept papers that may have gaps the fill-in services could fill (no free PDF
   link, or no abstract), never asked before; most cited first. */
export async function needingFill(db: Queryable, limit: number): Promise<{ key: string; paper: Paper }[]> {
  const { rows } = await db.query<{ key: string; data: Paper }>(
    `select key, data from paper_record
     where doi is not null and "filledAt" is null and (coalesce(data->>'pdfUrl', '') = '' or not "hasAbstract")
     order by "citedByCount" desc, key limit $1`,
    [limit],
  );
  return rows.map((r) => ({ key: r.key, paper: r.data }));
}

/* Store papers with their gaps filled, and mark every key asked about (filled or not). */
export async function saveFilled(db: Queryable, asked: string[], filled: { key: string; paper: Paper }[]): Promise<void> {
  if (filled.length) {
    await db.query(
      `update paper_record p set data = f.data from jsonb_to_recordset($1::jsonb) as f(key text, data jsonb) where p.key = f.key`,
      [JSON.stringify(filled.map((f) => ({ key: f.key, data: f.paper })))],
    );
  }
  if (asked.length) await db.query(`update paper_record set "filledAt" = now() where key = any($1::text[])`, [asked]);
}

/* Kept papers not fetched from their provider for `days`, oldest first. */
export async function dueForRefresh(db: Queryable, days: number, limit: number): Promise<{ key: string; paper: Paper }[]> {
  const { rows } = await db.query<{ key: string; data: Paper }>(
    `select key, data from paper_record where "fetchedAt" < now() - make_interval(days => $1) order by "fetchedAt", key limit $2`,
    [days, limit],
  );
  return rows.map((r) => ({ key: r.key, paper: r.data }));
}

/* Fresh records from their provider replace ours (full details kept, as in
   merge.ts); every key asked about counts as fetched now, found or not. */
export async function saveRefreshed(db: Queryable, asked: string[], fresh: { key: string; paper: Paper }[]): Promise<void> {
  if (fresh.length) {
    await db.query(
      `update paper_record p set data = case when p.detail then p.data || (f.data - 'topics' - 'referenceIds') else f.data end
       from jsonb_to_recordset($1::jsonb) as f(key text, data jsonb)
       where p.key = f.key and p.provider = f.data->>'provider'`,
      [JSON.stringify(fresh.map((f) => ({ key: f.key, data: f.paper })))],
    );
  }
  if (asked.length) await db.query(`update paper_record set "fetchedAt" = now() where key = any($1::text[])`, [asked]);
}

/* Rows, the table's size on disk (with indexes), and the part of it live rows
   take: Postgres reuses the space of deleted rows rather than shrinking the
   file, so limits are checked against the live part. */
export type CopySize = { rows: number; bytes: number; liveBytes: number };

export async function copySize(db: Queryable): Promise<CopySize> {
  const { rows } = await db.query<{ rows: string; bytes: string; live: string | null; dead: string | null }>(
    `select (select count(*) from paper_record) as rows, pg_total_relation_size('paper_record') as bytes,
       (select n_live_tup from pg_stat_user_tables where relid = 'paper_record'::regclass) as live,
       (select n_dead_tup from pg_stat_user_tables where relid = 'paper_record'::regclass) as dead`,
  );
  const r = rows[0];
  const live = Number(r.live ?? 0);
  const dead = Number(r.dead ?? 0);
  const bytes = Number(r.bytes);
  return { rows: Number(r.rows), bytes, liveBytes: live + dead > 0 ? Math.round((bytes * live) / (live + dead)) : bytes };
}

/* Remove the least useful papers (seen least, then longest ago) until the copy
   is within its limits, at most `batch` rows a run. Returns how many were removed. */
export async function trimCopy(db: Queryable, limits: { maxRows: number; maxBytes: number }, batch: number): Promise<number> {
  const size = await copySize(db);
  const overRows = Math.max(0, size.rows - limits.maxRows);
  const overBytes = size.liveBytes > limits.maxBytes && size.rows ? Math.ceil(size.rows * (1 - limits.maxBytes / size.liveBytes)) : 0;
  const remove = Math.min(batch, Math.max(overRows, overBytes));
  if (!remove) return 0;
  const { rowCount } = await db.query(`delete from paper_record where key in (select key from paper_record order by hits, "seenAt", key limit $1)`, [remove]);
  return rowCount ?? 0;
}
