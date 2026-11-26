import { USD_PER_CREDIT_COST } from '@/lib/pricing';
import type { Queryable } from '@/lib/shelf/db';

/* What credits bring in against what the providers really cost, for the
   owner. Revenue is counted at $0.01 a credit (annual plans bring in a little
   less), so the margin shown is gross margin on variable cost.

   The daily checks look for anything wrong: balances that don't match their
   history, holds nobody settled, a category earning under 60%, and users whose
   spending suddenly jumps. */

export const USD_PER_CREDIT = 0.01;
export const MARGIN_ALERT = 0.6;

export type MarginRow = { key: string; actions: number; credits: number; costUsd: number; margin: number | null };

const margin = (credits: number, cost: number) => (credits > 0 ? 1 - cost / (credits * USD_PER_CREDIT) : cost > 0 ? -1 : null);
const rows = (r: { key: string | null; actions: number; credits: number; cost: number }[]): MarginRow[] =>
  r.map((x) => ({ key: x.key ?? '—', actions: x.actions, credits: x.credits, costUsd: Number(x.cost), margin: margin(x.credits, Number(x.cost)) }));

export async function marginReport(q: Queryable, days = 30) {
  const since = `"settledAt" > now() - make_interval(days => $1)`;
  const by = async (key: string, join = '') =>
    rows(
      (
        await q.query<{ key: string | null; actions: number; credits: number; cost: number }>(
          `select ${key} as key, count(*)::int as actions, sum(a.charged)::int as credits, sum(a."costUsd") as cost
           from credit_action a ${join} where a.status = 'settled' and a.${since} group by 1 order by 3 desc nulls last`,
          [days],
        )
      ).rows,
    );
  const [kind, model, plan] = await Promise.all([
    by('a.kind'),
    by(`a.meta->>'model'`),
    by(`coalesce(p.plan, 'no plan')`, 'left join credit_plan p on p."userId" = a."userId"'),
  ]);
  return { kind, model: model.filter((m) => m.key !== '—'), plan };
}

/* The latest paid actions with their line items, for the admin page. */
export async function recentActions(q: Queryable, limit = 30) {
  const { rows: list } = await q.query<{ id: string; userId: string; email: string | null; kind: string; status: string; held: number; charged: number; costUsd: number; outcome: string | null; createdAt: Date }>(
    `select a.id, a."userId", u.email, a.kind, a.status, a.held, a.charged, a."costUsd", a.outcome, a."createdAt"
     from credit_action a left join "user" u on u.id = a."userId" order by a."createdAt" desc limit $1`,
    [limit],
  );
  const { rows: lines } = await q.query<{ actionId: string; kind: string; label: string; costUsd: number; ok: boolean }>(
    `select "actionId", kind, label, "costUsd", ok from credit_line_item where "actionId" = any($1) order by id`,
    [list.map((a) => a.id)],
  );
  return list.map((a) => ({ ...a, costUsd: Number(a.costUsd), lines: lines.filter((l) => l.actionId === a.id).map((l) => ({ ...l, costUsd: Number(l.costUsd) })) }));
}

export type CheckFindings = {
  /* users whose lots don't add up to their history */
  mismatched: string[];
  /* holds past their time that the sweep hasn't settled */
  stuckHolds: number;
  /* categories earning under the alert level yesterday (at least 20 actions) */
  lowMargin: { kind: string; margin: number; actions: number }[];
  /* users spending far more today than usual */
  spikes: { userId: string; email: string | null; today: number; usual: number }[];
};

export async function creditChecks(q: Queryable): Promise<CheckFindings> {
  const [mismatched, stuck, low, spikes] = await Promise.all([
    q.query<{ userId: string }>(
      `select l."userId" from (select "userId", sum(remaining)::bigint as r from credit_lot group by 1) l
       left join (select "userId", sum(delta)::bigint as d from credit_entry group by 1) e on e."userId" = l."userId"
       where l.r <> coalesce(e.d, 0) limit 50`,
    ),
    q.query<{ n: number }>(`select count(*)::int as n from credit_action where status = 'held' and "expiresAt" < now() - interval '15 minutes'`),
    q.query<{ kind: string; credits: number; cost: number; actions: number }>(
      `select kind, sum(charged)::int as credits, sum("costUsd") as cost, count(*)::int as actions from credit_action
       where status = 'settled' and "settledAt" >= date_trunc('day', now() at time zone 'utc') at time zone 'utc' - interval '1 day'
         and "settledAt" < date_trunc('day', now() at time zone 'utc') at time zone 'utc'
       group by 1 having count(*) >= 20`,
    ),
    q.query<{ userId: string; email: string | null; today: number; usual: number }>(
      `with t as (select "userId", sum(charged)::int as today from credit_action where "createdAt" >= date_trunc('day', now() at time zone 'utc') at time zone 'utc' group by 1),
            u as (select "userId", sum(charged)::float / 14 as usual from credit_action
                  where "createdAt" >= now() - interval '15 days' and "createdAt" < date_trunc('day', now() at time zone 'utc') at time zone 'utc' group by 1)
       select t."userId", x.email, t.today, coalesce(u.usual, 0)::float as usual from t left join u on u."userId" = t."userId" left join "user" x on x.id = t."userId"
       where t.today >= 100 and t.today > 3 * greatest(coalesce(u.usual, 0), 10) order by t.today desc limit 20`,
    ),
  ]);
  return {
    mismatched: mismatched.rows.map((r) => r.userId),
    stuckHolds: stuck.rows[0].n,
    lowMargin: low.rows
      .map((r) => ({ kind: r.kind, actions: r.actions, margin: margin(r.credits, Number(r.cost)) ?? 0 }))
      .filter((r) => r.margin < MARGIN_ALERT),
    spikes: spikes.rows.map((r) => ({ ...r, usual: Math.round(Number(r.usual)) })),
  };
}

export const hasFindings = (f: CheckFindings) => f.mismatched.length > 0 || f.stuckHolds > 0 || f.lowMargin.length > 0 || f.spikes.length > 0;

/* The most one credit may cost and still keep the target margin (for reference on the admin page). */
export const TARGET_COST_PER_CREDIT = USD_PER_CREDIT_COST;
