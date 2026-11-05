import type { PoolClient } from 'pg';
import { pool } from './db';
import { FREE_MONTHLY_CREDITS, monthKey, nextReset, type Balance, type LedgerRow } from './pricing';

/* The credit ledger. Balances live in credit_balance; every change is also
   written to credit_ledger in the same transaction, so the two always agree. */

type Row = { free: number; paid: number; freeMonth: string };

async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

const shape = (r: Row): Balance => ({ free: r.free, paid: r.paid, total: r.free + r.paid, freeMonthly: FREE_MONTHLY_CREDITS, resetsAt: nextReset() });

/* Lock the user's row, creating it and applying this month's free allowance if due. */
async function lockRow(c: PoolClient, userId: string): Promise<Row> {
  await c.query(`insert into credit_balance ("userId") values ($1) on conflict do nothing`, [userId]);
  const { rows } = await c.query<Row>(`select free, paid, "freeMonth" from credit_balance where "userId" = $1 for update`, [userId]);
  const row = rows[0];
  const month = monthKey();
  if (row.freeMonth !== month) {
    const delta = FREE_MONTHLY_CREDITS - row.free;
    await c.query(`update credit_balance set free = $2, "freeMonth" = $3, "updatedAt" = now() where "userId" = $1`, [userId, FREE_MONTHLY_CREDITS, month]);
    await c.query(`insert into credit_ledger ("userId", "freeDelta", reason, ref) values ($1, $2, 'monthly', $3) on conflict (ref) do nothing`, [userId, delta, `monthly:${userId}:${month}`]);
    row.free = FREE_MONTHLY_CREDITS;
    row.freeMonth = month;
  }
  return row;
}

export function getBalance(userId: string) {
  return tx(async (c) => shape(await lockRow(c, userId)));
}

export class InsufficientCredits extends Error {
  constructor(public balance: Balance, public needed: number) {
    super(`This needs ${needed} credit${needed === 1 ? '' : 's'} and you have ${balance.total}.`);
  }
}

/* Spend credits, free ones first. Throws InsufficientCredits without changing anything. */
export function spend(userId: string, amount: number, reason: 'trace' | 'cite', meta: Record<string, unknown> = {}) {
  return tx(async (c) => {
    const row = await lockRow(c, userId);
    if (row.free + row.paid < amount) throw new InsufficientCredits(shape(row), amount);
    const fromFree = Math.min(row.free, amount);
    const fromPaid = amount - fromFree;
    await c.query(`update credit_balance set free = free - $2, paid = paid - $3, "updatedAt" = now() where "userId" = $1`, [userId, fromFree, fromPaid]);
    const { rows } = await c.query<{ id: string }>(
      `insert into credit_ledger ("userId", "freeDelta", "paidDelta", reason, meta) values ($1, $2, $3, $4, $5) returning id`,
      [userId, -fromFree, -fromPaid, reason, JSON.stringify(meta)],
    );
    return { spendId: rows[0].id, balance: shape({ ...row, free: row.free - fromFree, paid: row.paid - fromPaid }) };
  });
}

/* Give back some or all of a spend (a trace that failed or was stopped). The
   search runs in the browser, so the server can't check the reason: refunds are
   limited to once per spend, within 10 minutes, and 10 a day. */
const REFUND_WINDOW_MS = 10 * 60 * 1000;
const REFUNDS_PER_DAY = 10;
export function refundSpend(userId: string, spendId: string, amount?: number) {
  return tx(async (c) => {
    const { rows } = await c.query<{ freeDelta: number; paidDelta: number; refunded: boolean; createdAt: Date; reason: string }>(
      `select "freeDelta", "paidDelta", refunded, "createdAt", reason from credit_ledger where id = $1 and "userId" = $2 for update`,
      [spendId, userId],
    );
    const s = rows[0];
    if (!s || s.refunded || !['trace', 'cite'].includes(s.reason) || Date.now() - new Date(s.createdAt).getTime() > REFUND_WINDOW_MS) return null;
    const recent = await c.query<{ n: string }>(
      `select count(*) as n from credit_ledger where "userId" = $1 and reason = 'trace-refund' and "createdAt" > now() - interval '1 day'`,
      [userId],
    );
    if (Number(recent.rows[0].n) >= REFUNDS_PER_DAY) return null;
    const spent = -(s.freeDelta + s.paidDelta);
    const back = Math.max(0, Math.min(spent, amount ?? spent));
    if (!back) return null;
    // return paid credits first (they never expire), then free ones
    const toPaid = Math.min(-s.paidDelta, back);
    const toFree = back - toPaid;
    const row = await lockRow(c, userId);
    // free credits from a previous month have already been reset; don't revive them
    const sameMonth = monthKey(new Date(s.createdAt)) === monthKey();
    const freeBack = sameMonth ? Math.min(toFree, FREE_MONTHLY_CREDITS - row.free) : 0;
    await c.query(`update credit_balance set free = free + $2, paid = paid + $3, "updatedAt" = now() where "userId" = $1`, [userId, freeBack, toPaid]);
    await c.query(`update credit_ledger set refunded = true where id = $1`, [spendId]);
    await c.query(`insert into credit_ledger ("userId", "freeDelta", "paidDelta", reason, ref) values ($1, $2, $3, 'trace-refund', $4)`, [
      userId, freeBack, toPaid, `refund-spend:${spendId}`,
    ]);
    return shape({ ...row, free: row.free + freeBack, paid: row.paid + toPaid });
  });
}

/* Add (or with a negative amount, remove) paid credits. `ref` makes it idempotent:
   a webhook delivered twice only counts once. Returns false if already applied. */
export function adjustPaid(userId: string, amount: number, reason: 'purchase' | 'refund' | 'adjust', ref: string, meta: Record<string, unknown> = {}) {
  return tx(async (c) => {
    const row = await lockRow(c, userId);
    const delta = amount < 0 ? -Math.min(row.paid, -amount) : amount;
    const ins = await c.query(
      `insert into credit_ledger ("userId", "paidDelta", reason, ref, meta) values ($1, $2, $3, $4, $5) on conflict (ref) do nothing returning id`,
      [userId, delta, reason, ref, JSON.stringify(meta)],
    );
    if (!ins.rowCount) return false;
    await c.query(`update credit_balance set paid = paid + $2, "updatedAt" = now() where "userId" = $1`, [userId, delta]);
    return true;
  });
}

export async function history(userId: string, limit = 25): Promise<LedgerRow[]> {
  const { rows } = await pool.query<{ id: string; createdAt: Date; freeDelta: number; paidDelta: number; reason: string; meta: Record<string, unknown>; refunded: boolean }>(
    `select id, "createdAt", "freeDelta", "paidDelta", reason, meta, refunded from credit_ledger
     where "userId" = $1 and ("freeDelta" <> 0 or "paidDelta" <> 0) order by "createdAt" desc, id desc limit $2`,
    [userId, limit],
  );
  return rows.map((r) => ({ id: r.id, createdAt: new Date(r.createdAt).toISOString(), delta: r.freeDelta + r.paidDelta, reason: r.reason, meta: r.meta, refunded: r.refunded }));
}

/* Credits a Polar purchase grants, read from the product's metadata ("credits": 500). */
export function creditsFor(metadata: Record<string, unknown> | null | undefined) {
  const n = Number(metadata?.credits);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
