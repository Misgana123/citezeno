import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createBilling } from '@/lib/credits/billing';
import { runCreditJobs } from '@/lib/credits/jobs';
import { creditChecks, hasFindings, marginReport, recentActions } from '@/lib/credits/report';
import { createWallet, type Wallet } from '@/lib/credits/wallet';
import { openTestDb, TEST_DB_URL, type TestDb } from '../shelf/testdb';

describe.skipIf(!TEST_DB_URL)('owner reporting', { timeout: 120_000 }, () => {
  let db: TestDb;
  let w: Wallet;
  beforeAll(async () => {
    db = await openTestDb();
    await db.pool.query(`alter table "user" add column if not exists email text, add column if not exists name text`);
    w = createWallet(db.pool);
  });
  afterAll(async () => db?.close());

  it('reports credits against real cost by action, with the margin', async () => {
    const u = await db.addUser();
    await w.grant({ userId: u, source: 'plan', amount: 100, expiresAt: new Date(Date.now() + 86_400_000), ref: `r:${u}` });
    const h = await w.hold({ userId: u, kind: 'assistant', amount: 10, ttlMs: 60_000, meta: { model: 'm1' } });
    await w.addLine(h.actionId, { kind: 'model', label: 'm1', costUsd: 0.009 });
    await w.settle({ actionId: h.actionId, outcome: 'finished' });
    const r = await marginReport(db.pool, 30);
    const row = r.kind.find((k) => k.key === 'assistant')!;
    // 3 credits = $0.03 in, $0.009 out → 70%
    expect(row).toMatchObject({ actions: 1, credits: 3 });
    expect(row.margin).toBeCloseTo(0.7);
    expect(r.model.find((m) => m.key === 'm1')).toBeTruthy();
    expect(r.plan.find((p) => p.key === 'no plan')).toBeTruthy();
    expect((await recentActions(db.pool, 5))[0].lines).toEqual([expect.objectContaining({ label: 'm1' })]);
  });

  it('finds balances that don’t match their history, and stuck holds', async () => {
    const u = await db.addUser();
    await w.grant({ userId: u, source: 'plan', amount: 5, expiresAt: new Date(Date.now() + 86_400_000), ref: `m:${u}` });
    expect((await creditChecks(db.pool)).mismatched).not.toContain(u);
    await db.pool.query(`update credit_lot set remaining = remaining + 3 where "userId" = $1`, [u]);
    const f = await creditChecks(db.pool);
    expect(f.mismatched).toContain(u);
    expect(hasFindings(f)).toBe(true);
    await db.pool.query(`insert into credit_action (id, "userId", kind, "expiresAt") values ($1, $2, 'trace', now() - interval '1 hour')`, [`stuck-${u}`, u]);
    expect((await creditChecks(db.pool)).stuckHolds).toBeGreaterThanOrEqual(1);
  });

  it('runs the checks once a day and tells the admins when something is found', async () => {
    const alert = vi.fn(async () => {});
    const b = createBilling(db.pool, w, {});
    const first = await runCreditJobs({ db: db.pool, wallet: w, billing: b, siteURL: 'http://x', alert });
    const again = await runCreditJobs({ db: db.pool, wallet: w, billing: b, siteURL: 'http://x', alert });
    expect([first.checked, again.checked]).toEqual([true, false]);
    // the sweep settled the stuck hold; the tampered balance is still reported
    expect(alert).toHaveBeenCalledTimes(1);
  });
});
