import { isPlanKey, limitsFor, monthlyCreditsFor, packForProduct, PACK_EXPIRY_DAYS, planForProduct, PLANS, type Interval, type Limits, type PlanKey } from '@/lib/plans';
import type { Db } from '@/lib/shelf/db';
import type { Clock, Wallet } from './wallet';

/* Plans and payments: which plan each user is on (kept in step with Polar
   subscriptions), and the credits each payment adds.

   - A monthly plan adds its credits once per paid period; they expire when the period ends.
   - An annual plan adds one month's credits at a time (the cron adds the next
     slice each month), each slice expiring a month later. Never the year up front.
   - An upgrade adds the difference straight away, prorated for what's left of
     the current month; it expires with that month's credits.
   - A downgrade or cancel takes nothing back: credits last until they expire.
   - A top-up pack adds its credits for 12 months.
   - A refund takes back the matching share of what that order added, but only
     what is still unspent. */

type Env = Record<string, string | undefined>;
type Meta = Record<string, unknown> | null | undefined;

export type SubscriptionLike = {
  id: string;
  status?: string | null;
  product_id?: string | null;
  product?: { id?: string | null } | null;
  customer?: { external_id?: string | null } | null;
  metadata?: Meta;
  current_period_start?: string | Date | null;
  current_period_end?: string | Date | null;
  cancel_at_period_end?: boolean | null;
};

export type OrderLike = {
  id: string;
  customer?: { external_id?: string | null } | null;
  product_id?: string | null;
  product?: { id?: string | null; name?: string | null } | null;
  metadata?: Meta;
  subscription_id?: string | null;
  subscription?: SubscriptionLike | null;
  total_amount?: number;
  refunded_amount?: number;
  currency?: string;
  billing_reason?: string | null;
};

export type CurrentPlan = { plan: PlanKey; interval: Interval; status: string; periodEnd: string | null; cancelAtPeriodEnd: boolean; limits: Limits };

/* Statuses where the subscription no longer gives a plan. */
const ENDED = new Set(['revoked', 'unpaid', 'incomplete', 'incomplete_expired', 'ended']);
/* A missed renewal keeps the plan this long past the period end while Polar retries. */
const GRACE_MS = 3 * 86_400_000;

const date = (v: string | Date | null | undefined) => (v ? new Date(v) : null);
export function addMonths(d: Date, n: number) {
  const x = new Date(d);
  const day = x.getUTCDate();
  x.setUTCMonth(x.getUTCMonth() + n);
  // 31 Jan + 1 month → 28/29 Feb, not 3 Mar
  if (x.getUTCDate() < day) x.setUTCDate(0);
  return x;
}
const earliest = (...ds: (Date | null)[]) => ds.filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0];

const userOf = (o: { customer?: { external_id?: string | null } | null; metadata?: Meta }) =>
  o.customer?.external_id || (typeof o.metadata?.userId === 'string' ? (o.metadata.userId as string) : null);
const productOf = (o: { product_id?: string | null; product?: { id?: string | null } | null }) => o.product_id || o.product?.id || null;

type PlanRow = {
  userId: string; plan: PlanKey; interval: Interval; status: string; subscriptionId: string; productId: string; periodStart: Date | null; periodEnd: Date | null;
  cancelAtPeriodEnd: boolean; yearOrderId: string | null; slicesGranted: number; nextSliceAt: Date | null;
};
const COLS = `"userId", plan, "interval", status, "subscriptionId", "productId", "periodStart", "periodEnd", "cancelAtPeriodEnd", "yearOrderId", "slicesGranted", "nextSliceAt"`;

export const isActive = (r: Pick<PlanRow, 'status' | 'periodEnd'>, now: Date) =>
  !ENDED.has(r.status) && (!r.periodEnd || r.periodEnd.getTime() + GRACE_MS > now.getTime()) && (r.status !== 'canceled' || !r.periodEnd || r.periodEnd > now);

export type Billing = ReturnType<typeof createBilling>;

export function createBilling(db: Db, wallet: Wallet, env: Env = process.env, clock: Clock = () => new Date()) {
  async function row(userId: string): Promise<PlanRow | null> {
    const { rows } = await db.query<PlanRow>(`select ${COLS} from credit_plan where "userId" = $1`, [userId]);
    return rows[0] ?? null;
  }

  async function currentPlan(userId: string): Promise<CurrentPlan | null> {
    const r = await row(userId);
    if (!r || !isPlanKey(r.plan) || !isActive(r, clock())) return null;
    return { plan: r.plan, interval: r.interval, status: r.status, periodEnd: r.periodEnd?.toISOString() ?? null, cancelAtPeriodEnd: r.cancelAtPeriodEnd, limits: limitsFor(r.plan) };
  }

  async function save(userId: string, s: SubscriptionLike, plan: PlanKey, interval: Interval, productId: string) {
    await db.query(
      `insert into credit_plan ("userId", plan, "interval", status, "subscriptionId", "productId", "periodStart", "periodEnd", "cancelAtPeriodEnd", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       on conflict ("userId") do update set plan = excluded.plan, "interval" = excluded."interval", status = excluded.status,
         "subscriptionId" = excluded."subscriptionId", "productId" = excluded."productId",
         "periodStart" = coalesce(excluded."periodStart", credit_plan."periodStart"), "periodEnd" = coalesce(excluded."periodEnd", credit_plan."periodEnd"),
         "cancelAtPeriodEnd" = excluded."cancelAtPeriodEnd",
         -- a different subscription starts its own year
         "yearOrderId" = case when credit_plan."subscriptionId" = excluded."subscriptionId" then credit_plan."yearOrderId" else null end,
         "slicesGranted" = case when credit_plan."subscriptionId" = excluded."subscriptionId" then credit_plan."slicesGranted" else 0 end,
         "nextSliceAt" = case when credit_plan."subscriptionId" = excluded."subscriptionId" and excluded.status not in ('revoked', 'unpaid', 'incomplete_expired') then credit_plan."nextSliceAt" else null end,
         "updatedAt" = excluded."updatedAt"`,
      [userId, plan, interval, s.status || 'active', s.id, productId, date(s.current_period_start), date(s.current_period_end), Boolean(s.cancel_at_period_end), clock()],
    );
  }

  /* The start and end of the month of credits the user is in now. */
  function currentMonth(r: PlanRow, now: Date): { start: Date; end: Date } | null {
    if (r.interval === 'year') {
      if (!r.nextSliceAt) return null;
      return { start: addMonths(r.nextSliceAt, -1), end: r.nextSliceAt };
    }
    if (!r.periodEnd || r.periodEnd <= now) return null;
    return { start: r.periodStart ?? addMonths(r.periodEnd, -1), end: r.periodEnd };
  }

  return {
    currentPlan,

    /* subscription.created / active / updated / canceled / uncanceled / revoked... */
    async onSubscription(s: SubscriptionLike) {
      const userId = userOf(s);
      const hit = planForProduct(productOf(s), env);
      if (!userId || !hit) {
        if (userId && !hit) console.warn('[citezeno] Polar subscription ignored: its product is not a configured plan', s.id);
        return;
      }
      const now = clock();
      const before = await row(userId);
      await save(userId, s, hit.plan.key, hit.interval, productOf(s)!);
      // an upgrade within the same subscription adds the difference for what's left of this month
      if (before && before.subscriptionId === s.id && isActive(before, now) && before.plan !== hit.plan.key && !ENDED.has(s.status || '')) {
        const diff = monthlyCreditsFor(hit.plan.key, env) - monthlyCreditsFor(before.plan, env);
        const month = currentMonth({ ...before, periodEnd: date(s.current_period_end) ?? before.periodEnd }, now);
        if (diff > 0 && month) {
          const left = Math.max(0, Math.min(1, (month.end.getTime() - now.getTime()) / (month.end.getTime() - month.start.getTime())));
          await wallet.grant({
            userId, source: 'plan', amount: Math.round(diff * left), expiresAt: month.end, reason: 'plan',
            ref: `upgrade:${s.id}:${hit.plan.key}:${month.end.toISOString()}`, meta: { plan: PLANS[hit.plan.key].name, upgradeFrom: PLANS[before.plan].name },
          });
        }
      }
    },

    async onOrderPaid(o: OrderLike) {
      const userId = userOf(o);
      const productId = productOf(o);
      if (!userId) return console.warn('[citezeno] Polar order ignored: no user', o.id);
      const now = clock();
      const meta = { orderId: o.id, product: o.product?.name ?? undefined, amount: o.total_amount, currency: o.currency, billingReason: o.billing_reason ?? undefined };

      const pack = packForProduct(productId, env);
      if (pack) {
        await wallet.grant({ userId, source: 'pack', amount: pack.credits, expiresAt: new Date(now.getTime() + PACK_EXPIRY_DAYS * 86_400_000), ref: `order:${o.id}`, reason: 'pack', meta });
        return;
      }
      const hit = planForProduct(productId, env);
      if (!hit) return console.warn('[citezeno] Polar order ignored: its product is neither a plan nor a top-up', o.id);
      // a mid-period plan change is paid as a prorated order; its credits come from the subscription update
      if (o.billing_reason === 'subscription_update') return;
      const sub: SubscriptionLike = o.subscription ?? { id: o.subscription_id || `order:${o.id}` };
      await save(userId, { status: 'active', ...sub }, hit.plan.key, hit.interval, productId!);
      const periodEnd = date(sub.current_period_end);
      const planMeta = { ...meta, plan: PLANS[hit.plan.key].name, interval: hit.interval };
      if (hit.interval === 'month') {
        await wallet.grant({ userId, source: 'plan', amount: hit.monthlyCredits, expiresAt: periodEnd ?? addMonths(now, 1), ref: `order:${o.id}`, reason: 'plan', meta: planMeta });
        return;
      }
      // annual: the first month now, the other eleven from the cron, one a month
      const next = addMonths(now, 1);
      await wallet.grant({ userId, source: 'plan', amount: hit.monthlyCredits, expiresAt: earliest(next, periodEnd), ref: `order:${o.id}:1`, reason: 'plan', meta: { ...planMeta, slice: 1 } });
      await db.query(`update credit_plan set "yearOrderId" = $2, "slicesGranted" = 1, "nextSliceAt" = $3 where "userId" = $1`, [userId, o.id, periodEnd && periodEnd <= next ? null : next]);
    },

    async onOrderRefunded(o: OrderLike) {
      const userId = userOf(o);
      if (!userId) return;
      const share = o.total_amount ? Math.min(1, (o.refunded_amount || 0) / o.total_amount) : 1;
      const { rows: lots } = await db.query<{ id: string; ref: string; amount: number }>(
        `select id::text, ref, amount from credit_lot where "userId" = $1 and (ref = $2 or ref like $2 || ':%') order by "expiresAt" asc nulls last, id`,
        [userId, `order:${o.id}`],
      );
      if (!lots.length) return;
      const granted = lots.reduce((n, l) => n + l.amount, 0);
      const { rows } = await db.query<{ done: string | null }>(`select -sum(delta) as done from credit_entry where kind = 'remove' and "lotId" = any($1::bigint[])`, [lots.map((l) => l.id)]);
      let left = Math.round(granted * share) - Number(rows[0]?.done || 0);
      for (const l of lots) {
        if (left <= 0) break;
        left -= await wallet.remove({ userId, lotRef: l.ref, amount: left, ref: `refund:${o.id}:${o.refunded_amount ?? 0}:${l.id}`, reason: 'refund', meta: { orderId: o.id }, close: share >= 1 });
      }
      // a fully refunded year adds no more monthly slices
      if (share >= 1) await db.query(`update credit_plan set "nextSliceAt" = null where "userId" = $1 and "yearOrderId" = $2`, [userId, o.id]);
    },

    /* Cron: add the next monthly slice of every annual plan that's due. */
    async addAnnualSlices(limit = 200) {
      const now = clock();
      const { rows } = await db.query<PlanRow>(`select ${COLS} from credit_plan where "nextSliceAt" <= $1 order by "nextSliceAt" limit $2`, [now, limit]);
      let added = 0;
      for (const r of rows) {
        const due = r.nextSliceAt!;
        const n = r.slicesGranted + 1;
        const live = isActive(r, now) && r.yearOrderId && n <= 12;
        if (live) {
          const end = earliest(addMonths(due, 1), r.periodEnd);
          // the plan may have changed since the year was paid: use today's plan
          const lot = await wallet.grant({
            userId: r.userId, source: 'plan', amount: monthlyCreditsFor(r.plan, env), expiresAt: end, ref: `order:${r.yearOrderId}:${n}`, reason: 'plan',
            meta: { orderId: r.yearOrderId, plan: PLANS[r.plan].name, interval: 'year', slice: n },
          });
          if (lot) added++;
        }
        const next = addMonths(due, 1);
        const more = live && n < 12 && (!r.periodEnd || next < r.periodEnd);
        await db.query(`update credit_plan set "slicesGranted" = $2, "nextSliceAt" = $3 where "userId" = $1`, [r.userId, live ? n : r.slicesGranted, more ? next : null]);
      }
      return added;
    },
  };
}
