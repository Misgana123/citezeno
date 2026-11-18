import { toPaper } from '@/lib/papers/mapper';
import type { OpenAlexClient } from '@/lib/papers/openalex/client';
import { DETAIL_FIELDS, selectParam } from '@/lib/papers/openalex/fields';
import type { OpenAlexWork } from '@/lib/papers/openalex/types';
import { tx, type Db } from '../db';
import { noticeRetracted } from '../store/notices';
import { putShared } from '../store/papers';

/* Keeping saved papers up to date. Shared records that are on someone's shelf
   are rechecked with OpenAlex every few days, 50 per call
   (filter=openalex_id:W1|W2|…, a list call), through the same cache, rate
   limiter, cost log and daily cap as Find Papers. Citation counts and details
   are refreshed; a paper that has become retracted gets a notice for every
   user who saved it. Records saved while OpenAlex was down go first. */

export const REFRESH_BATCH = 50;

export async function papersToRefresh(db: Db, olderThanDays: number, limit: number): Promise<{ id: string; isRetracted: boolean; title: string }[]> {
  const { rows } = await db.query<{ id: string; isRetracted: boolean; title: string }>(
    `select p.id, p."isRetracted", p.title from shelf_paper p
     where p."ownerId" is null
       and (p."refreshDue" or p."refreshedAt" is null or p."refreshedAt" < now() - make_interval(days => $1))
       and exists (select 1 from shelf_item i where i."paperId" = p.id)
     order by p."refreshDue" desc, p."refreshedAt" nulls first
     limit $2`,
    [Math.max(1, Math.floor(olderThanDays)), limit],
  );
  return rows;
}

export type RefreshReport = { refreshed: number; newlyRetracted: number; notices: number; missing: number };

/* Recheck one batch of papers. */
export async function refreshBatch(db: Db, client: OpenAlexClient, papers: { id: string; isRetracted: boolean; title: string }[]): Promise<RefreshReport> {
  const report: RefreshReport = { refreshed: 0, newlyRetracted: 0, notices: 0, missing: 0 };
  if (!papers.length) return report;
  const { body } = await client.get<{ results?: OpenAlexWork[] }>('/works', { filter: `openalex_id:${papers.map((p) => p.id).join('|')}`, per_page: REFRESH_BATCH, select: selectParam(DETAIL_FIELDS) });
  const fresh = new Map((body.results ?? []).map(toPaper).filter((p): p is NonNullable<typeof p> => !!p).map((p) => [p.id, p]));
  await tx(db, async (q) => {
    for (const old of papers) {
      const p = fresh.get(old.id);
      if (!p) {
        // gone from OpenAlex (merged or withdrawn): keep what we have, try again next time round
        await q.query(`update shelf_paper set "refreshedAt" = now(), "refreshDue" = false where id = $1`, [old.id]);
        report.missing++;
        continue;
      }
      await putShared(q, p);
      report.refreshed++;
      if (p.isRetracted && !old.isRetracted) {
        report.newlyRetracted++;
        report.notices += await noticeRetracted(q, p.id, p.title);
      }
    }
  });
  return report;
}

export async function refreshPapers(db: Db, client: OpenAlexClient, opts: { olderThanDays: number; batches: number; deadline: number; now?: () => number }): Promise<RefreshReport> {
  const now = opts.now ?? Date.now;
  const total: RefreshReport = { refreshed: 0, newlyRetracted: 0, notices: 0, missing: 0 };
  for (let b = 0; b < opts.batches && now() < opts.deadline; b++) {
    const papers = await papersToRefresh(db, opts.olderThanDays, REFRESH_BATCH);
    if (!papers.length) break;
    const r = await refreshBatch(db, client, papers);
    for (const k of Object.keys(total) as (keyof RefreshReport)[]) total[k] += r[k];
  }
  return total;
}
