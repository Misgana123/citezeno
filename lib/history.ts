import { pool } from './db';
import type { HistoryFilter, HistoryItem } from './history-format';
export { FILTERS, describe, type HistoryFilter, type HistoryItem } from './history-format';

/* One timeline from two sources: the activity log (traces, sharing, security)
   and the credit ledger (every credit spent, returned, bought or granted). */

const KINDS: Record<Exclude<HistoryFilter, 'all'>, string[]> = {
  traces: ['trace.created', 'trace.renamed', 'trace.deleted', 'credits.trace', 'credits.cite', 'credits.trace-refund'],
  credits: ['credits.monthly', 'credits.purchase', 'credits.refund', 'credits.adjust', 'credits.trace', 'credits.cite', 'credits.trace-refund'],
  sharing: ['trace.shared', 'trace.unshared'],
  security: ['auth.signin', 'auth.password', 'auth.2fa-on', 'auth.2fa-off'],
};

export async function loadHistory(userId: string, opts: { filter?: HistoryFilter; before?: string | null; limit?: number } = {}) {
  const filter = opts.filter && opts.filter !== 'all' ? KINDS[opts.filter] : null;
  const limit = Math.min(500, opts.limit ?? 60);
  const before = opts.before && !Number.isNaN(Date.parse(opts.before)) ? opts.before : null;
  const { rows } = await pool.query<HistoryItem & { at: Date }>(
    `select x.*, (t.id is not null) as "traceExists" from (
       select 'a' || id as id, "createdAt" as at, kind, "traceId", title, meta, null::int as delta
       from activity where "userId" = $1
       union all
       select 'l' || id, "createdAt", 'credits.' || reason, null, null, meta || jsonb_build_object('refunded', refunded), "freeDelta" + "paidDelta"
       from credit_ledger where "userId" = $1 and "freeDelta" + "paidDelta" <> 0
     ) x
     left join trace t on t."userId" = $1 and t.id = x."traceId"
     where ($2::timestamptz is null or x.at < $2) and ($3::text[] is null or x.kind = any($3))
     order by x.at desc, x.id desc
     limit $4`,
    [userId, before, filter, limit + 1],
  );
  const items = rows.slice(0, limit).map((r) => ({ ...r, at: new Date(r.at).toISOString() }));
  return { items, next: rows.length > limit ? items[items.length - 1].at : null };
}

