import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CREDITS_CARRY_OVER_SQL, CREDITS_SQL } from '@/lib/credits/schema';
import { createWallet } from '@/lib/credits/wallet';
import { openTestDb, TEST_DB_URL, type TestDb } from '../shelf/testdb';

describe.skipIf(!TEST_DB_URL)('credit tables', { timeout: 60_000 }, () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await openTestDb();
  });
  afterAll(async () => db?.close());

  it('can be created again without changes', async () => {
    await db.pool.query(CREDITS_SQL);
    await db.pool.query(CREDITS_SQL);
  });

  it('carries old balances over once: bought credits never expire, this month’s free ones end with the month', async () => {
    // without the old table it does nothing
    await db.pool.query(CREDITS_CARRY_OVER_SQL);
    await db.pool.query(`create table credit_balance ("userId" text primary key, free integer not null default 0, paid integer not null default 0, "freeMonth" text not null default '')`);
    const a = await db.addUser();
    const b = await db.addUser();
    const month = new Date().toISOString().slice(0, 7);
    await db.pool.query(`insert into credit_balance values ($1, 12, 300, $3), ($2, 30, 0, '2000-01')`, [a, b, month]);
    await db.pool.query(CREDITS_CARRY_OVER_SQL);
    await db.pool.query(CREDITS_CARRY_OVER_SQL);
    const w = createWallet(db.pool);
    const ba = await w.balance(a);
    expect(ba.total).toBe(312);
    expect(ba.lots.map((l) => [l.source, l.remaining, l.expiresAt === null])).toEqual([['promo', 12, false], ['legacy', 300, true]]);
    // last month's free credits were already used up or reset: nothing carries
    expect((await w.balance(b)).total).toBe(0);
    expect((await w.history(a)).map((r) => r.delta).sort((x, y) => x - y)).toEqual([12, 300]);
  });
});
