import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InsufficientCredits } from '@/lib/credits/errors';
import { createMeter, estimateChatUsd } from '@/lib/credits/meter';
import { createWallet, type Wallet } from '@/lib/credits/wallet';
import { openTestDb, TEST_DB_URL, type TestDb } from '../shelf/testdb';

describe('estimates', () => {
  it('counts the prompt at about 4 characters a token and every output token allowed', () => {
    // 4000 chars → 1000 tokens at $1/M, 500 output at $4/M
    expect(estimateChatUsd({ inputUsdPerM: 1, outputUsdPerM: 4 }, 4000, 500)).toBeCloseTo(0.003);
  });
});

describe.skipIf(!TEST_DB_URL)('metered actions', { timeout: 90_000 }, () => {
  let db: TestDb;
  let w: Wallet;
  beforeAll(async () => {
    db = await openTestDb();
    w = createWallet(db.pool);
  });
  afterAll(async () => db?.close());

  const funded = async (n: number) => {
    const u = await db.addUser();
    if (n) await w.grant({ userId: u, source: 'plan', amount: n, expiresAt: new Date(Date.now() + 86_400_000), ref: `m:${u}` });
    return u;
  };

  it('holds nothing until a step needs it, so a free action needs no credits', async () => {
    const u = await funded(0);
    const m = createMeter(w, { userId: u, kind: 'reader.summary' });
    expect(await m.finish({ outcome: 'finished', useful: true })).toBeNull();
  });

  it('tops the hold up step by step and charges the real total once', async () => {
    const u = await funded(20);
    const m = createMeter(w, { userId: u, kind: 'assistant' });
    await m.reserve(0.002);
    await m.record({ kind: 'model', costUsd: 0.002 });
    await m.reserve(0.008);
    await m.record({ kind: 'web_search', costUsd: 0.008 });
    expect((await w.balance(u)).held).toBe(4);
    expect(await m.finish({ outcome: 'finished', useful: true })).toEqual({ charged: 4 });
    expect((await w.balance(u))).toMatchObject({ total: 16, held: 0 });
  });

  it('refuses a step the balance can’t cover, and charges nothing for a failure', async () => {
    const u = await funded(2);
    const m = createMeter(w, { userId: u, kind: 'reader.ask' });
    await m.reserve(0.001);
    await m.record({ kind: 'model', costUsd: 0.001 });
    await expect(m.reserve(0.05)).rejects.toBeInstanceOf(InsufficientCredits);
    expect(await m.tryReserve(0.05)).toBe(false);
    expect(await m.finish({ outcome: 'failed', useful: false })).toEqual({ charged: 0 });
    expect((await w.balance(u)).total).toBe(2);
  });

  it('a resumed action that was already charged is never charged again', async () => {
    const u = await funded(10);
    const first = createMeter(w, { userId: u, kind: 'reader.embed', actionId: `embed:${u}` });
    await first.reserve(0.001);
    await first.record({ kind: 'embed', costUsd: 0.001 });
    await first.finish({ outcome: 'finished', useful: true });
    const again = createMeter(w, { userId: u, kind: 'reader.embed', actionId: `embed:${u}` });
    await again.reserve(0.01);
    await again.record({ kind: 'embed', costUsd: 0.01 });
    expect(await again.finish({ outcome: 'finished', useful: true })).toBeNull();
    expect((await w.balance(u)).total).toBe(9);
  });

  it('parallel steps share one hold safely', async () => {
    const u = await funded(30);
    const m = createMeter(w, { userId: u, kind: 'assistant' });
    await Promise.all([1, 2, 3, 4].map(async () => {
      await m.reserve(0.003);
      await m.record({ kind: 'model', costUsd: 0.003 });
    }));
    expect(await m.finish({ outcome: 'finished', useful: true })).toEqual({ charged: 4 });
  });
});
