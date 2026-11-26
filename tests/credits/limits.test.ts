import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { trimHistory } from '@/lib/agent/loop';
import { InsufficientCredits } from '@/lib/credits/errors';
import { usageFor, nearLimit } from '@/lib/credits/usage';
import { createWallet, type Wallet } from '@/lib/credits/wallet';
import { limitsFor, NO_PLAN, PLAN_KEYS, PLANS } from '@/lib/plans';
import type { ChatMessage } from '@/lib/providers/chat/types';
import { papersToRefresh } from '@/lib/shelf/service/refresh';
import { saveManualPaper } from '@/lib/shelf/service/save-manual';
import { startImport } from '@/lib/shelf/service/import-start';
import { shelfConfig } from '@/lib/shelf/config';
import { addItem } from '@/lib/shelf/store/items';
import { putShared } from '@/lib/shelf/store/papers';
import { paper } from '../shelf/fixtures';
import { openTestDb, TEST_DB_URL, type TestDb } from '../shelf/testdb';

const details = (title: string) => ({ title, authors: [], year: null, source: null, url: null, doi: null, type: null, abstract: null });

describe('chat context per plan', () => {
  const msg = (role: 'user' | 'assistant', n: number): ChatMessage => (role === 'user' ? { role, text: 'x'.repeat(n) } : { role, text: 'y'.repeat(n), toolCalls: [] });

  it('drops the oldest turns past the token limit, cutting at a user message', () => {
    const history = [msg('user', 4000), msg('assistant', 4000), msg('user', 4000), msg('assistant', 4000), msg('user', 400)];
    expect(trimHistory(history, 60)).toHaveLength(5);
    const t = trimHistory(history, 60, 2_500);
    expect(t[0].role).toBe('user');
    expect(t).toHaveLength(3);
  });

  it('always keeps the latest question, even when it alone is over the limit', () => {
    const t = trimHistory([msg('user', 100), msg('assistant', 100), msg('user', 100_000)], 60, 1_000);
    expect(t).toHaveLength(1);
  });
});

describe.skipIf(!TEST_DB_URL)('plan limits', { timeout: 120_000 }, () => {
  let db: TestDb;
  let w: Wallet;
  beforeAll(async () => {
    db = await openTestDb();
    await db.pool.query(`create table if not exists trace ("userId" text, id text)`);
    await db.pool.query(`create table if not exists papers_usage ("userId" text, day text, searches integer, primary key ("userId", day))`);
    w = createWallet(db.pool);
  });
  afterAll(async () => db?.close());

  const funded = async (n: number) => {
    const u = await db.addUser();
    await w.grant({ userId: u, source: 'plan', amount: n, expiresAt: new Date(Date.now() + 86_400_000), ref: `l:${u}` });
    return u;
  };

  it('allows only so many paid actions at once', async () => {
    const u = await funded(50);
    const guard = { concurrent: 2, dailySpend: 1000 };
    await w.hold({ userId: u, kind: 'assistant', amount: 1, ttlMs: 60_000, guard });
    await w.hold({ userId: u, kind: 'assistant', amount: 1, ttlMs: 60_000, guard });
    await expect(w.hold({ userId: u, kind: 'assistant', amount: 1, ttlMs: 60_000, guard })).rejects.toMatchObject({ code: 'limit_reached' });
    // background embedding doesn't count as an action at once
    await w.hold({ userId: u, kind: 'reader.embed', amount: 1, ttlMs: 60_000, guard });
  });

  it('stops at the day’s spending limit, counting holds', async () => {
    const u = await funded(100);
    const guard = { concurrent: 10, dailySpend: 10 };
    const h = await w.hold({ userId: u, kind: 'trace', amount: 6, ttlMs: 60_000, guard });
    await w.settle({ actionId: h.actionId, credits: 6, outcome: 'finished' });
    await w.hold({ userId: u, kind: 'trace', amount: 3, ttlMs: 60_000, guard });
    await expect(w.hold({ userId: u, kind: 'trace', amount: 2, ttlMs: 60_000, guard })).rejects.toMatchObject({ code: 'limit_reached' });
    // running out of credits is still its own error
    const poor = await funded(1);
    await expect(w.hold({ userId: poor, kind: 'trace', amount: 2, ttlMs: 60_000, guard })).rejects.toBeInstanceOf(InsufficientCredits);
  });

  it('a full shelf takes no more papers, and an import must fit', async () => {
    const u = await db.addUser();
    await saveManualPaper(db.pool, u, details('One'), null, 'manual', 2);
    await saveManualPaper(db.pool, u, details('Two'), null, 'manual', 2);
    await expect(saveManualPaper(db.pool, u, details('Three'), null, 'manual', 2)).rejects.toMatchObject({ code: 'user_limit' });
    const bib = '@article{a, title={A}}\n@article{b, title={B}}';
    await expect(startImport(db.pool, { ...shelfConfig({}), maxItems: 3 }, u, { fileName: 'x.bib', text: bib })).rejects.toMatchObject({ code: 'user_limit' });
  });

  it('refreshes each paper on the shortest schedule of the plans that saved it; no plan, no refresh', async () => {
    const [lab, starter, none] = [await db.addUser(), await db.addUser(), await db.addUser()];
    const plan = (u: string, p: string) =>
      db.pool.query(`insert into credit_plan ("userId", plan, "interval", status, "subscriptionId", "productId", "periodEnd") values ($1, $2, 'month', 'active', $3, 'p', now() + interval '20 days')`, [u, p, `s-${u}`]);
    await plan(lab, 'lab');
    await plan(starter, 'starter');
    for (const id of ['openalex:R1', 'openalex:R2', 'openalex:R3']) await putShared(db.pool, paper(id));
    await db.pool.query(`update shelf_paper set "refreshedAt" = now() - interval '3 days' where id like 'openalex:R%'`);
    await addItem(db.pool, lab, 'openalex:R1', 'search');
    await addItem(db.pool, starter, 'openalex:R2', 'search');
    await addItem(db.pool, none, 'openalex:R3', 'search');
    const byPlan = Object.fromEntries(PLAN_KEYS.map((k) => [k, PLANS[k].limits.shelfRefreshDays]));
    const due = (await papersToRefresh(db.pool, ['openalex'], 7, 50, byPlan)).map((p) => p.id).filter((id) => id.startsWith('openalex:R'));
    expect(due).toEqual(['openalex:R1']);
  });

  it('sums up what the user has used of each limit', async () => {
    const u = await funded(20);
    await saveManualPaper(db.pool, u, details('Counted'));
    const usage = await usageFor(db.pool, u, 'starter');
    expect(usage.planName).toBe('Starter');
    expect(usage.rows.find((r) => r.key === 'shelf')).toMatchObject({ used: 1, limit: limitsFor('starter').shelfPapers });
    expect(nearLimit({ used: 8, limit: 10 })).toBe(true);
    expect(nearLimit({ used: 7, limit: 10 })).toBe(false);
    expect((await usageFor(db.pool, u, null)).rows.find((r) => r.key === 'credits')!.limit).toBe(NO_PLAN.dailySpendCap);
  });
});
