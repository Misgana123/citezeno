import type { Paper } from '../types';
import { recordKey, type PaperCopyStore, type Queryable, type StoredPaper } from './types';

/* The Postgres paper copy (table paper_record, see schema.ts). Each save is one
   statement for the whole batch; merging follows merge.ts:
     - another provider's copy only fills a missing abstract or PDF link;
     - the owner's newer record replaces ours, but a result card never wipes
       full details (it updates everything except topics and references). */

const UPSERT = `
insert into paper_record as p (key, ids, data, detail, origin)
select r.key, array[r.id], r.data, r.detail, $2
from jsonb_to_recordset($1::jsonb) as r(key text, id text, data jsonb, detail boolean)
on conflict (key) do update set
  ids = case when excluded.ids[1] = any(p.ids) then p.ids else p.ids || excluded.ids end,
  data = case
    when p.provider is distinct from excluded.data->>'provider' then p.data || jsonb_strip_nulls(jsonb_build_object(
      'abstract', case when coalesce(p.data->>'abstract', '') = '' then excluded.data->'abstract' end,
      'pdfUrl',   case when coalesce(p.data->>'pdfUrl', '') = '' then excluded.data->'pdfUrl' end))
    when excluded.detail or not p.detail then excluded.data
    else p.data || (excluded.data - 'topics' - 'referenceIds')
  end,
  detail = case when p.provider is distinct from excluded.data->>'provider' then p.detail else p.detail or excluded.detail end,
  "fetchedAt" = case when p.provider is distinct from excluded.data->>'provider' then p."fetchedAt" else now() end,
  "seenAt" = now(),
  hits = p.hits + 1`;

type Row = { ids: string[]; data: Paper; detail: boolean; fetchedAt: Date };

const toStored = (r: Row): StoredPaper => ({ paper: r.data, detail: r.detail, fetchedAt: new Date(r.fetchedAt).getTime() });

export function pgPaperCopy(db: Queryable): PaperCopyStore {
  return {
    async save(papers, { detail, origin }) {
      // one row per key (a batch may repeat a paper), in key order so concurrent saves can't deadlock
      const byKey = new Map(papers.map((p) => [recordKey(p), p]));
      const rows = [...byKey.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([key, p]) => ({ key, id: p.id, data: p, detail }));
      if (!rows.length) return;
      await db.query(UPSERT, [JSON.stringify(rows), origin]);
    },
    async byIds(ids) {
      const out = new Map<string, StoredPaper>();
      if (!ids.length) return out;
      const { rows } = await db.query<Row>(`select ids, data, detail, "fetchedAt" from paper_record where ids && $1::text[]`, [ids]);
      for (const r of rows) for (const id of ids) if (r.ids.includes(id)) out.set(id, toStored(r));
      return out;
    },
    async byDois(dois) {
      const out = new Map<string, StoredPaper>();
      const wanted = [...new Set(dois.map((d) => d.toLowerCase()))];
      if (!wanted.length) return out;
      const { rows } = await db.query<Row & { key: string }>(`select key, ids, data, detail, "fetchedAt" from paper_record where key = any($1::text[])`, [wanted.map((d) => `doi:${d}`)]);
      for (const r of rows) out.set(r.key.slice(4), toStored(r));
      return out;
    },
    async touch(ids) {
      if (!ids.length) return;
      await db.query(`update paper_record set "seenAt" = now(), hits = hits + 1 where ids && $1::text[]`, [ids]);
    },
  };
}
