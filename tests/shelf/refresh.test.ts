import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { OpenAlexClient, QueryParams } from '@/lib/papers/openalex/client';
import { papersToRefresh, refreshPapers } from '@/lib/shelf/service/refresh';
import { addItem, getItem } from '@/lib/shelf/store/items';
import { markNoticesRead, unreadNotices } from '@/lib/shelf/store/notices';
import { ensureShared, getPaper, putShared } from '@/lib/shelf/store/papers';
import { paper } from './fixtures';
import { openTestDb, TEST_DB_URL, type TestDb } from './testdb';

const work = (id: string, over: Record<string, unknown> = {}) => ({ id: `https://openalex.org/${id}`, display_name: `Paper ${id}`, cited_by_count: 99, is_retracted: false, authorships: [], ...over });

describe.skipIf(!TEST_DB_URL)('keeping saved papers up to date (Postgres)', () => {
  let db: TestDb;
  let alice: string;
  let bob: string;
  const age = (id: string, days: number) => db.pool.query(`update shelf_paper set "refreshedAt" = now() - make_interval(days => $2) where id = $1`, [id, days]);

  beforeAll(async () => {
    db = await openTestDb();
    alice = await db.addUser();
    bob = await db.addUser();
    for (const id of ['W1', 'W2', 'W3', 'W4']) await putShared(db.pool, paper(id, { citedByCount: 1 }));
    await ensureShared(db.pool, paper('W5')); // saved while OpenAlex was down
    for (const id of ['W1', 'W2', 'W3', 'W5']) await addItem(db.pool, alice, id, 'search');
    await addItem(db.pool, bob, 'W2', 'search');
    // W4 is on nobody's shelf
    await age('W1', 10);
    await age('W2', 10);
    await age('W4', 30);
  });
  afterAll(async () => db?.close());

  it('picks papers someone saved that are due, those saved during an outage first', async () => {
    const due = (await papersToRefresh(db.pool, 7, 50)).map((p) => p.id);
    expect(due[0]).toBe('W5');
    expect(due.sort()).toEqual(['W1', 'W2', 'W5']);
  });

  it('refreshes citation counts and tells everyone who saved a newly retracted paper', async () => {
    const get = vi.fn(async (path: string, params: QueryParams = {}) => {
      const ids = String(params.filter).replace('openalex_id:', '').split('|');
      // W1 is gone from OpenAlex; W2 has been retracted
      return { body: { results: ids.filter((id) => id !== 'W1').map((id) => work(id, id === 'W2' ? { is_retracted: true } : {})) }, costUsd: 0.0001, status: 200 };
    });
    const r = await refreshPapers(db.pool, { get } as unknown as OpenAlexClient, { olderThanDays: 7, batches: 5, deadline: Date.now() + 10_000 });
    expect(r).toEqual({ refreshed: 2, newlyRetracted: 1, notices: 2, missing: 1 });
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][1]).toMatchObject({ per_page: 50 });
    expect(await getPaper(db.pool, 'W2')).toMatchObject({ isRetracted: true, citedByCount: 99 });
    const { rows } = await db.pool.query(`select "refreshDue" from shelf_paper where id = 'W5'`);
    expect(rows[0].refreshDue).toBe(false);

    // nothing more is due, so a second run asks OpenAlex nothing
    await refreshPapers(db.pool, { get } as unknown as OpenAlexClient, { olderThanDays: 7, batches: 5, deadline: Date.now() + 10_000 });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('notices are per user, point at their item, and can be dismissed', async () => {
    const a = await unreadNotices(db.pool, alice);
    expect(a).toMatchObject({ unread: 1, notices: [{ kind: 'retracted', title: 'Paper W2' }] });
    expect((await getItem(db.pool, alice, a.notices[0].itemId!))?.paper.id).toBe('W2');
    expect(await markNoticesRead(db.pool, bob, [a.notices[0].id])).toBe(0); // not bob's
    expect(await markNoticesRead(db.pool, alice)).toBe(1);
    expect((await unreadNotices(db.pool, alice)).unread).toBe(0);
    expect((await unreadNotices(db.pool, bob)).unread).toBe(1);
  });

  it('an already retracted paper does not notify again', async () => {
    await age('W2', 10);
    const get = vi.fn(async () => ({ body: { results: [work('W2', { is_retracted: true })] }, costUsd: 0, status: 200 }));
    const r = await refreshPapers(db.pool, { get } as unknown as OpenAlexClient, { olderThanDays: 7, batches: 1, deadline: Date.now() + 10_000 });
    expect(r.newlyRetracted).toBe(0);
  });
});
