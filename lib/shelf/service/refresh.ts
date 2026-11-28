import { splitPaperId } from '@/lib/papers/ids';
import type { Paper } from '@/lib/papers/types';
import type { PaperSources } from '@/lib/providers/papers/sources';
import type { PaperSource } from '@/lib/providers/papers/types';
import { tx, type Db } from '../db';
import { noticeRetracted } from '../store/notices';
import { putShared } from '../store/papers';

/* Keeping saved papers up to date. Shared records that are on someone's shelf
   are rechecked with their own provider every few days, 50 at a time (OpenAlex:
   one list call), through the same gateway (cache, rate limiter, cost log,
   daily cap) as Find Papers. Citation counts and details are refreshed; a
   paper that has become retracted gets a notice for every user who saved it.
   Records saved while their provider was down go first. Papers from a provider
   that is no longer enabled are left as they are. */

export const REFRESH_BATCH = 50;

export type DuePaper = { id: string; provider: string; isRetracted: boolean; title: string };

/* Days between refreshes for each plan's shelves (lib/plans.ts); a paper is
   due on the shortest schedule among the users who saved it; a lab's shelf
   goes by its owner's plan. Shelves without a plan aren't refreshed (records
   saved during an outage still are). */
export type PlanRefresh = Record<string, number | null>;

export async function papersToRefresh(db: Db, providers: readonly string[], olderThanDays: number, limit: number, byPlan?: PlanRefresh): Promise<DuePaper[]> {
  if (byPlan) {
    const plans = Object.entries(byPlan).filter((e): e is [string, number] => e[1] != null);
    const { rows } = await db.query<DuePaper>(
      `with plan_days (plan, days) as (select * from unnest($3::text[], $4::int[]))
       select p.id, p.provider, p."isRetracted", p.title from shelf_paper p
       where p."ownerId" is null and p.provider = any($2)
         and (p."refreshDue" or exists (
           select 1 from shelf_item i
           left join lab l on l."shelfUserId" = i."userId"
           join credit_plan c on c."userId" = coalesce(l."ownerId", i."userId")
             and c.status not in ('revoked', 'unpaid', 'incomplete', 'incomplete_expired', 'ended')
             and (c."periodEnd" is null or c."periodEnd" > now() - interval '3 days')
           join plan_days d on d.plan = c.plan
           where i."paperId" = p.id and (p."refreshedAt" is null or p."refreshedAt" < now() - make_interval(days => d.days))))
       order by p."refreshDue" desc, p."refreshedAt" nulls first
       limit $1`,
      [limit, [...providers], plans.map((e) => e[0]), plans.map((e) => Math.max(1, Math.floor(e[1])))],
    );
    return rows;
  }
  const { rows } = await db.query<DuePaper>(
    `select p.id, p.provider, p."isRetracted", p.title from shelf_paper p
     where p."ownerId" is null and p.provider = any($3)
       and (p."refreshDue" or p."refreshedAt" is null or p."refreshedAt" < now() - make_interval(days => $1))
       and exists (select 1 from shelf_item i where i."paperId" = p.id)
     order by p."refreshDue" desc, p."refreshedAt" nulls first
     limit $2`,
    [Math.max(1, Math.floor(olderThanDays)), limit, [...providers]],
  );
  return rows;
}

/* Fresh copies by the provider's own IDs: in few calls when the source can, else one by one. */
async function fetchMany(source: PaperSource, ids: string[]): Promise<Map<string, Paper>> {
  if (source.getPapers) return (await source.getPapers('id', ids)).found;
  const found = new Map<string, Paper>();
  for (const id of ids) {
    const { paper } = await source.getPaper({ kind: 'id', id });
    if (paper) found.set(id, paper);
  }
  return found;
}

/* Fresh copies of these papers, each from its own provider, by paper ID. */
async function freshCopies(sources: PaperSources, papers: DuePaper[]): Promise<Map<string, Paper>> {
  const out = new Map<string, Paper>();
  const byProvider = new Map<string, DuePaper[]>();
  for (const p of papers) byProvider.set(p.provider, [...(byProvider.get(p.provider) ?? []), p]);
  for (const [provider, group] of byProvider) {
    const source = sources.named(provider);
    if (!source) continue;
    const native = new Map(group.flatMap((p) => { const s = splitPaperId(p.id); return s ? [[s.providerId, p.id] as const] : []; }));
    const found = await fetchMany(source, [...native.keys()]);
    for (const [providerId, paper] of found) {
      const id = native.get(providerId);
      if (id) out.set(id, paper);
    }
  }
  return out;
}

export type RefreshReport = { refreshed: number; newlyRetracted: number; notices: number; missing: number };

/* Recheck one batch of papers. */
export async function refreshBatch(db: Db, sources: PaperSources, papers: DuePaper[]): Promise<RefreshReport> {
  const report: RefreshReport = { refreshed: 0, newlyRetracted: 0, notices: 0, missing: 0 };
  if (!papers.length) return report;
  const fresh = await freshCopies(sources, papers);
  await tx(db, async (q) => {
    for (const old of papers) {
      const p = fresh.get(old.id);
      if (!p) {
        // gone from the source (merged or withdrawn): keep what we have, try again next time round
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

export async function refreshPapers(db: Db, sources: PaperSources, opts: { olderThanDays: number; batches: number; deadline: number; now?: () => number; byPlan?: PlanRefresh }): Promise<RefreshReport> {
  const now = opts.now ?? Date.now;
  const total: RefreshReport = { refreshed: 0, newlyRetracted: 0, notices: 0, missing: 0 };
  for (let b = 0; b < opts.batches && now() < opts.deadline; b++) {
    const papers = await papersToRefresh(db, sources.all.map((s) => s.name), opts.olderThanDays, REFRESH_BATCH, opts.byPlan);
    if (!papers.length) break;
    const r = await refreshBatch(db, sources, papers);
    for (const k of Object.keys(total) as (keyof RefreshReport)[]) total[k] += r[k];
  }
  return total;
}
