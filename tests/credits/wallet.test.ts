import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWallet, type Wallet } from '@/lib/credits/wallet';
import { InsufficientCredits } from '@/lib/credits/errors';
import { openTestDb, TEST_DB_URL, type TestDb } from '../shelf/testdb';

const DAY = 86_400_000;
const MIN = 60_000;

describe.skipIf(!TEST_DB_URL)('credit wallet', { timeout: 60_000 }, () => {
  let db: TestDb;
  let now = new Date('2026-11-10T12:00:00Z').getTime();
  let w: Wallet;
  beforeAll(async () => {
    db = await openTestDb();
    w = createWallet(db.pool, () => new Date(now));
  });
  afterAll(async () => db?.close());

  const at = (ms: number) => new Date(now + ms);

  it('spends the lot that expires soonest first, and never-expiring lots last', async () => {
    const u = await db.addUser();
    await w.grant({ userId: u, source: 'legacy', amount: 10, expiresAt: null, ref: `l:${u}` });
    await w.grant({ userId: u, source: 'pack', amount: 10, expiresAt: at(300 * DAY), ref: `p:${u}` });
    await w.grant({ userId: u, source: 'plan', amount: 10, expiresAt: at(20 * DAY), ref: `m:${u}` });
    const h = await w.hold({ userId: u, kind: 'trace', amount: 15, ttlMs: 15 * MIN });
    const s = await w.settle({ actionId: h.actionId, credits: 15, outcome: 'finished' });
    expect(s.charged).toBe(15);
    const left = Object.fromEntries(s.balance.lots.map((l) => [l.source, l.remaining]));
    expect(left).toEqual({ pack: 5, legacy: 10 });
    expect(s.balance.total).toBe(15);
  });

  it('grants once per ref', async () => {
    const u = await db.addUser();
    expect(await w.grant({ userId: u, source: 'plan', amount: 5, expiresAt: at(DAY), ref: `once:${u}` })).not.toBeNull();
    expect(await w.grant({ userId: u, source: 'plan', amount: 5, expiresAt: at(DAY), ref: `once:${u}` })).toBeNull();
    expect((await w.balance(u)).total).toBe(5);
  });

  it('keeps held credits out of the available balance, then charges the real cost and releases the rest', async () => {
    const u = await db.addUser();
    await w.grant({ userId: u, source: 'plan', amount: 20, expiresAt: at(DAY), ref: `h:${u}` });
    const h = await w.hold({ userId: u, kind: 'assistant', amount: 10, ttlMs: 15 * MIN });
    expect(h.held).toBe(10);
    expect(h.balance).toMatchObject({ total: 10, held: 10 });
    await w.addLine(h.actionId, { kind: 'model', costUsd: 0.004 });
    await w.addLine(h.actionId, { kind: 'web_search', costUsd: 0.008 });
    await w.addLine(h.actionId, { kind: 'web_search', costUsd: 0.008, ok: false });
    const s = await w.settle({ actionId: h.actionId, outcome: 'finished' });
    // $0.012 → 4 credits; the failed search isn't charged
    expect(s.charged).toBe(4);
    expect(s.balance).toMatchObject({ total: 16, held: 0 });
  });

  it('never charges more than the hold, and settles only once', async () => {
    const u = await db.addUser();
    await w.grant({ userId: u, source: 'plan', amount: 20, expiresAt: at(DAY), ref: `cap:${u}` });
    const h = await w.hold({ userId: u, kind: 'assistant', amount: 3, ttlMs: 15 * MIN });
    await w.addLine(h.actionId, { kind: 'model', costUsd: 1 });
    expect((await w.settle({ actionId: h.actionId, outcome: 'finished' })).charged).toBe(3);
    const again = await w.settle({ actionId: h.actionId, credits: 0, outcome: 'stopped' });
    expect(again).toMatchObject({ charged: 3, already: true });
    expect((await w.balance(u)).total).toBe(17);
  });

  it('refuses a hold that does not fit, or places a smaller one down to min', async () => {
    const u = await db.addUser();
    await w.grant({ userId: u, source: 'plan', amount: 4, expiresAt: at(DAY), ref: `min:${u}` });
    await expect(w.hold({ userId: u, kind: 'assistant', amount: 10, ttlMs: MIN })).rejects.toBeInstanceOf(InsufficientCredits);
    const h = await w.hold({ userId: u, kind: 'assistant', amount: 10, min: 3, ttlMs: MIN });
    expect(h.held).toBe(4);
    await expect(w.hold({ userId: u, kind: 'assistant', amount: 1, ttlMs: MIN })).rejects.toBeInstanceOf(InsufficientCredits);
    expect(await w.extend(u, h.actionId, 1)).toBe(false);
  });

  it('extends a hold when the balance allows', async () => {
    const u = await db.addUser();
    await w.grant({ userId: u, source: 'plan', amount: 10, expiresAt: at(DAY), ref: `ext:${u}` });
    const h = await w.hold({ userId: u, kind: 'assistant', amount: 4, ttlMs: MIN });
    expect(await w.extend(u, h.actionId, 5)).toBe(true);
    expect((await w.balance(u)).total).toBe(1);
    expect((await w.spent(h.actionId))?.held).toBe(9);
  });

  it('returns the same hold for the same action id', async () => {
    const u = await db.addUser();
    await w.grant({ userId: u, source: 'plan', amount: 10, expiresAt: at(DAY), ref: `idem:${u}` });
    const a = await w.hold({ userId: u, kind: 'cite', amount: 1, ttlMs: MIN, actionId: `act-${u}` });
    const b = await w.hold({ userId: u, kind: 'cite', amount: 1, ttlMs: MIN, actionId: `act-${u}` });
    expect(b.actionId).toBe(a.actionId);
    expect(b.balance.total).toBe(9);
  });

  it('never lets two holds at once spend the same credits', async () => {
    const u = await db.addUser();
    await w.grant({ userId: u, source: 'plan', amount: 5, expiresAt: at(DAY), ref: `race:${u}` });
    const tries = await Promise.allSettled([1, 2, 3].map(() => w.hold({ userId: u, kind: 'trace', amount: 3, ttlMs: MIN })));
    expect(tries.filter((t) => t.status === 'fulfilled')).toHaveLength(1);
    expect((await w.balance(u)).total).toBe(2);
  });

  it('expires what is left of a lot, but credits on hold wait for their action', async () => {
    const u = await db.addUser();
    await w.grant({ userId: u, source: 'plan', amount: 10, expiresAt: at(DAY), ref: `exp:${u}` });
    await w.grant({ userId: u, source: 'pack', amount: 5, expiresAt: at(100 * DAY), ref: `exp2:${u}` });
    const h = await w.hold({ userId: u, kind: 'assistant', amount: 4, ttlMs: 2 * DAY });
    now += DAY + MIN;
    let b = await w.balance(u);
    expect(b).toMatchObject({ total: 5, held: 4 });
    // charge 1 of the 4: the 3 released credits belong to an expired lot, so they expire too
    const s = await w.settle({ actionId: h.actionId, credits: 1, outcome: 'finished' });
    expect(s.balance).toMatchObject({ total: 5, held: 0 });
    const hist = await w.history(u);
    expect(hist.filter((r) => r.kind === 'expire').map((r) => r.delta).sort()).toEqual([-3, -6]);
    b = await w.balance(u);
    expect(b.lots.map((l) => l.source)).toEqual(['pack']);
  });

  it('settles timed-out holds: in full for browser actions, by recorded cost for server actions', async () => {
    const u = await db.addUser();
    await w.grant({ userId: u, source: 'plan', amount: 30, expiresAt: at(10 * DAY), ref: `sweep:${u}` });
    const trace = await w.hold({ userId: u, kind: 'trace', amount: 5, ttlMs: 15 * MIN, onTimeout: 'full' });
    const reply = await w.hold({ userId: u, kind: 'assistant', amount: 10, ttlMs: 15 * MIN });
    await w.addLine(reply.actionId, { kind: 'model', costUsd: 0.005 });
    now += 16 * MIN;
    await w.sweep();
    expect((await w.balance(u))).toMatchObject({ total: 23, held: 0 });
    expect((await w.settle({ actionId: trace.actionId, credits: 0, outcome: 'late' })).charged).toBe(5);
  });

  it('removes only unspent credits of a refunded lot, once', async () => {
    const u = await db.addUser();
    await w.grant({ userId: u, source: 'pack', amount: 10, expiresAt: at(DAY), ref: `order:${u}` });
    const h = await w.hold({ userId: u, kind: 'trace', amount: 6, ttlMs: MIN });
    await w.settle({ actionId: h.actionId, credits: 6, outcome: 'finished' });
    expect(await w.remove({ userId: u, lotRef: `order:${u}`, amount: 10, ref: `refund:${u}`, reason: 'refund' })).toBe(4);
    expect(await w.remove({ userId: u, lotRef: `order:${u}`, amount: 10, ref: `refund:${u}`, reason: 'refund' })).toBe(0);
    expect((await w.balance(u)).total).toBe(0);
  });

  it('adjusts both ways', async () => {
    const u = await db.addUser();
    expect((await w.adjust({ userId: u, amount: 8, ref: `a1:${u}` })).total).toBe(8);
    expect((await w.adjust({ userId: u, amount: -3, ref: `a2:${u}` })).total).toBe(5);
    expect((await w.adjust({ userId: u, amount: -3, ref: `a2:${u}` })).total).toBe(5);
  });
});
