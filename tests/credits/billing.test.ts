import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addMonths, createBilling, type Billing } from '@/lib/credits/billing';
import { runCreditJobs } from '@/lib/credits/jobs';
import { createWallet, type Wallet } from '@/lib/credits/wallet';
import { openTestDb, TEST_DB_URL, type TestDb } from '../shelf/testdb';

const ENV = {
  POLAR_STARTER_MONTHLY_PRODUCT_ID: 'starter_m',
  POLAR_SCHOLAR_MONTHLY_PRODUCT_ID: 'scholar_m',
  POLAR_LAB_ANNUAL_PRODUCT_ID: 'lab_y',
  POLAR_SCHOLAR_ANNUAL_PRODUCT_ID: 'scholar_y',
  POLAR_TOPUP_SMALL_PRODUCT_ID: 'pack_s',
};
const DAY = 86_400_000;

describe('addMonths', () => {
  it('keeps the day, or the last day of a shorter month', () => {
    expect(addMonths(new Date('2026-01-31T00:00:00Z'), 1).toISOString()).toBe('2026-02-28T00:00:00.000Z');
    expect(addMonths(new Date('2026-11-15T10:00:00Z'), 1).toISOString()).toBe('2026-12-15T10:00:00.000Z');
  });
});

describe.skipIf(!TEST_DB_URL)('plans and payments', { timeout: 90_000 }, () => {
  let db: TestDb;
  let now = new Date('2026-11-01T00:00:00Z').getTime();
  let w: Wallet;
  let b: Billing;
  const clock = () => new Date(now);
  beforeAll(async () => {
    db = await openTestDb();
    await db.pool.query(`alter table "user" add column if not exists email text, add column if not exists name text`);
    w = createWallet(db.pool, clock);
    b = createBilling(db.pool, w, ENV, clock);
  });
  afterAll(async () => db?.close());

  const iso = (ms: number) => new Date(ms).toISOString();
  const sub = (id: string, user: string, product: string, more: Record<string, unknown> = {}) => ({
    id, status: 'active', product_id: product, customer: { external_id: user }, current_period_start: iso(now), current_period_end: iso(addMonths(new Date(now), 1).getTime()), ...more,
  });

  it('a monthly plan adds its credits for the period, once per order', async () => {
    const u = await db.addUser();
    const s = sub(`s-${u}`, u, 'scholar_m');
    await b.onSubscription(s);
    await b.onOrderPaid({ id: `o-${u}`, product_id: 'scholar_m', customer: { external_id: u }, subscription: s, billing_reason: 'subscription_create' });
    await b.onOrderPaid({ id: `o-${u}`, product_id: 'scholar_m', customer: { external_id: u }, subscription: s, billing_reason: 'subscription_create' });
    const bal = await w.balance(u);
    expect(bal.total).toBe(1900);
    expect(bal.lots[0]).toMatchObject({ source: 'plan', expiresAt: s.current_period_end });
    expect(await b.currentPlan(u)).toMatchObject({ plan: 'scholar', interval: 'month' });
  });

  it('an annual plan adds one month at a time from the cron', async () => {
    const u = await db.addUser();
    const s = sub(`sy-${u}`, u, 'lab_y', { current_period_end: iso(addMonths(new Date(now), 12).getTime()) });
    await b.onOrderPaid({ id: `oy-${u}`, product_id: 'lab_y', customer: { external_id: u }, subscription: s, billing_reason: 'subscription_create' });
    expect((await w.balance(u)).total).toBe(7900);
    expect(await b.addAnnualSlices()).toBe(0);
    const start = now;
    now = addMonths(new Date(start), 1).getTime() + 60_000;
    expect(await b.addAnnualSlices()).toBeGreaterThanOrEqual(1);
    const bal = await w.balance(u);
    // the first month's credits have expired; the second month's are there
    expect(bal.total).toBe(7900);
    expect(bal.lots).toHaveLength(1);
    now = start;
  });

  it('an upgrade adds the prorated difference for the rest of the month', async () => {
    const u = await db.addUser();
    const s = sub(`su-${u}`, u, 'starter_m');
    await b.onSubscription(s);
    await b.onOrderPaid({ id: `ou-${u}`, product_id: 'starter_m', customer: { external_id: u }, subscription: s, billing_reason: 'subscription_create' });
    const start = now;
    now += 15 * DAY; // half of a 30-day month
    await b.onSubscription({ ...s, product_id: 'scholar_m' });
    await b.onOrderPaid({ id: `ou2-${u}`, product_id: 'scholar_m', customer: { external_id: u }, subscription: s, billing_reason: 'subscription_update' });
    const bal = await w.balance(u);
    // 700 + (1900 - 700) × 15/30
    expect(bal.total).toBe(700 + 600);
    expect(await b.currentPlan(u)).toMatchObject({ plan: 'scholar' });
    now = start;
  });

  it('cancelling keeps the plan until the period ends; revoked ends it', async () => {
    const u = await db.addUser();
    const s = sub(`sc-${u}`, u, 'starter_m');
    await b.onSubscription(s);
    await b.onSubscription({ ...s, cancel_at_period_end: true });
    expect(await b.currentPlan(u)).toMatchObject({ plan: 'starter', cancelAtPeriodEnd: true });
    await b.onSubscription({ ...s, status: 'revoked' });
    expect(await b.currentPlan(u)).toBeNull();
  });

  it('a top-up lasts 12 months; a refund takes back only what is unspent', async () => {
    const u = await db.addUser();
    await b.onOrderPaid({ id: `op-${u}`, product_id: 'pack_s', customer: { external_id: u }, total_amount: 500 });
    let bal = await w.balance(u);
    expect(bal.total).toBe(500);
    expect(new Date(bal.lots[0].expiresAt!).getTime()).toBe(now + 365 * DAY);
    const h = await w.hold({ userId: u, kind: 'trace', amount: 100, ttlMs: 60_000 });
    await w.settle({ actionId: h.actionId, credits: 100, outcome: 'finished' });
    await b.onOrderRefunded({ id: `op-${u}`, product_id: 'pack_s', customer: { external_id: u }, total_amount: 500, refunded_amount: 250 });
    expect((await w.balance(u)).total).toBe(150);
    await b.onOrderRefunded({ id: `op-${u}`, product_id: 'pack_s', customer: { external_id: u }, total_amount: 500, refunded_amount: 500 });
    bal = await w.balance(u);
    expect(bal.total).toBe(0);
  });

  it('warns once, a week before a top-up ends', async () => {
    const u = await db.addUser();
    await db.pool.query(`update "user" set email = 'a@example.com', name = 'Ada' where id = $1`, [u]);
    await w.grant({ userId: u, source: 'pack', amount: 50, expiresAt: new Date(now + 3 * DAY), ref: `warn:${u}` });
    const r1 = await runCreditJobs({ db: db.pool, wallet: w, billing: b, siteURL: 'http://x', clock });
    const r2 = await runCreditJobs({ db: db.pool, wallet: w, billing: b, siteURL: 'http://x', clock });
    expect(r1.warned).toBe(1);
    expect(r2.warned).toBe(0);
  });
});
