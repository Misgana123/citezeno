import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdClaims, settleClaims, SHORT_SETTLES_PER_DAY } from '@/lib/credits/studio';
import { createWallet, type Wallet } from '@/lib/credits/wallet';
import { openTestDb, TEST_DB_URL, type TestDb } from '../shelf/testdb';

describe.skipIf(!TEST_DB_URL)('studio traces: hold, then settle at the claims searched', { timeout: 120_000 }, () => {
  let db: TestDb;
  let w: Wallet;
  beforeAll(async () => {
    db = await openTestDb();
    w = createWallet(db.pool);
  });
  afterAll(async () => db?.close());

  const funded = async (n: number) => {
    const u = await db.addUser();
    await w.grant({ userId: u, source: 'plan', amount: n, expiresAt: new Date(Date.now() + 86_400_000), ref: `f:${u}` });
    return u;
  };

  it('charges the claims searched and releases the rest', async () => {
    const u = await funded(20);
    const h = await holdClaims(w, u, 8, 'trace');
    expect(h.balance.total).toBe(12);
    const s = await settleClaims(db.pool, w, u, h.actionId, 5);
    expect(s.charged).toBe(5);
    expect(s.balance.total).toBe(15);
  });

  it('never charges more claims than were held', async () => {
    const u = await funded(10);
    const h = await holdClaims(w, u, 3, 'trace');
    expect((await settleClaims(db.pool, w, u, h.actionId, 99)).charged).toBe(3);
  });

  it('allows only a few short settles a day; after that a trace is charged in full', async () => {
    const u = await funded(100);
    for (let i = 0; i < SHORT_SETTLES_PER_DAY; i++) {
      const h = await holdClaims(w, u, 1, 'cite');
      expect((await settleClaims(db.pool, w, u, h.actionId, 0)).charged).toBe(0);
    }
    const h = await holdClaims(w, u, 4, 'trace');
    expect((await settleClaims(db.pool, w, u, h.actionId, 0)).charged).toBe(4);
  });

  it("can't settle someone else's trace", async () => {
    const a = await funded(5);
    const b = await funded(5);
    const h = await holdClaims(w, a, 2, 'trace');
    await expect(settleClaims(db.pool, w, b, h.actionId, 0)).rejects.toThrow();
  });
});
