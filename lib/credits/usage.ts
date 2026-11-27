import { limitsFor, planName, type Limits, type PlanKey } from '@/lib/plans';
import { utcDay } from '@/lib/providers/gateway/day';
import type { Queryable } from '@/lib/shelf/db';

/* How much of each plan limit the user has used, for the account page (with a
   warning from 80%). Counts come straight from the features' own tables. */

export type UsageRow = { key: string; label: string; used: number; limit: number; unit: 'count' | 'bytes' | 'credits'; resets?: 'day' | 'month' };
export type Usage = { plan: PlanKey | null; planName: string; rows: UsageRow[] };

export const WARN_AT = 0.8;
export const nearLimit = (r: Pick<UsageRow, 'used' | 'limit'>) => r.limit > 0 && r.used / r.limit >= WARN_AT;

export async function usageFor(q: Queryable, userId: string, plan: PlanKey | null, now = new Date()): Promise<Usage> {
  const l: Limits = limitsFor(plan);
  const { rows } = await q.query<{ searches: number; storage: string; files: string; traces: number; shelf: number; embeds: number; credits: number }>(
    `select
       coalesce((select searches from papers_usage where "userId" = $1 and day = $2), 0)::int as searches,
       coalesce((select sum("sizeBytes") from shelf_pdf where "userId" = $1), 0) as storage,
       coalesce((select sum("sizeBytes") from agent_file where "userId" = $1), 0) as files,
       (select count(*) from trace where "userId" = $1)::int as traces,
       (select count(*) from shelf_item where "userId" = $1)::int as shelf,
       (select count(*) from credit_action where "userId" = $1 and kind = 'reader.embed' and (charged > 0 or status = 'held')
          and "createdAt" >= date_trunc('month', $3::timestamptz at time zone 'utc') at time zone 'utc')::int as embeds,
       coalesce((select sum(case when status = 'held' then held else charged end) from credit_action where "userId" = $1
          and "createdAt" >= date_trunc('day', $3::timestamptz at time zone 'utc') at time zone 'utc'), 0)::int as credits`,
    [userId, utcDay(now.getTime()), now],
  );
  const u = rows[0];
  return {
    plan,
    planName: planName(plan),
    rows: [
      { key: 'searches', label: 'Searches today', used: u.searches, limit: l.searchesPerDay, unit: 'count', resets: 'day' },
      { key: 'storage', label: 'PDF storage', used: Number(u.storage), limit: l.pdfStorageBytes, unit: 'bytes' },
      { key: 'files', label: 'Files the assistant made', used: Number(u.files), limit: l.agentFilesBytes, unit: 'bytes' },
      { key: 'traces', label: 'Saved traces', used: u.traces, limit: l.savedTraces, unit: 'count' },
      { key: 'shelf', label: 'Papers on your shelf', used: u.shelf, limit: l.shelfPapers, unit: 'count' },
      { key: 'embeds', label: 'Your PDFs prepared for questions this month', used: u.embeds, limit: l.embedsPerMonth, unit: 'count', resets: 'month' },
      { key: 'credits', label: 'Credits used today', used: u.credits, limit: l.dailySpendCap, unit: 'credits', resets: 'day' },
    ],
  };
}
