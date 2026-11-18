import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PapersError } from '@/lib/papers/errors';
import type { OpenAlexClient } from '@/lib/papers/openalex/client';
import { parseListRequest } from '@/lib/shelf/api/list-request';
import { readClientPaper } from '@/lib/shelf/api/paper-schema';
import { saveFromSearch } from '@/lib/shelf/service/save-search';
import { getItem } from '@/lib/shelf/store/items';
import { createPrivate, getPaper, putShared } from '@/lib/shelf/store/papers';
import { createProject } from '@/lib/shelf/store/projects';
import { filtersFromParams, filtersToParams } from '@/components/shelf/shelf-state';
import { paper } from './fixtures';
import { openTestDb, TEST_DB_URL, type TestDb } from './testdb';

/* An OpenAlex work as /works/{id} returns it. */
const work = (id: string, over: Record<string, unknown> = {}) => ({
  id: `https://openalex.org/${id}`,
  doi: `https://doi.org/10.1000/${id.toLowerCase()}`,
  display_name: `Fresh ${id}`,
  publication_year: 2021,
  cited_by_count: 12,
  authorships: [],
  ...over,
});

function fakeClient(impl: (path: string) => unknown) {
  const get = vi.fn(async (path: string) => {
    const body = impl(path);
    if (body instanceof Error) throw body;
    return { body, costUsd: 0, status: 200 };
  });
  return { client: { get } as unknown as OpenAlexClient, get };
}

describe('client paper validation', () => {
  it('accepts a matching Paper and cleans it', () => {
    const p = readClientPaper({ ...paper('W5'), doi: 'https://doi.org/10.1234/ABC', landingUrl: 'javascript:alert(1)' }, 'W5');
    expect(p).toMatchObject({ id: 'W5', doi: '10.1234/abc', landingUrl: null });
  });

  it('rejects a paper for another ID or with bad fields', () => {
    expect(readClientPaper(paper('W6'), 'W5')).toBeNull();
    expect(readClientPaper({ ...paper('W5'), title: '' }, 'W5')).toBeNull();
    expect(readClientPaper('nope', 'W5')).toBeNull();
  });
});

describe('list request', () => {
  it('reads filters and defaults', () => {
    expect(parseListRequest(new URLSearchParams('project=unsorted&status=done&from=2010&oa=1&sort=cited&page=2'))).toMatchObject({
      project: 'unsorted',
      status: 'done',
      yearFrom: 2010,
      openAccess: true,
      sort: 'cited',
      page: 2,
      perPage: 25,
    });
    expect(parseListRequest(new URLSearchParams(''))).toMatchObject({ sort: 'added_desc', page: 1 });
  });

  it('rejects bad values with a readable message', () => {
    expect(() => parseListRequest(new URLSearchParams('status=finished'))).toThrow();
    expect(() => parseListRequest(new URLSearchParams('perPage=5000'))).toThrow();
  });
});

describe('shelf view state', () => {
  it('round-trips through the URL and drops defaults', () => {
    const f = filtersFromParams(new URLSearchParams('project=p1&status=reading&sort=title&oa=1&bogus=1'));
    expect(filtersToParams(f).toString()).toBe('project=p1&status=reading&oa=1&sort=title');
    expect(filtersToParams(filtersFromParams(new URLSearchParams('sort=nonsense&status=x'))).toString()).toBe('');
  });
});

describe.skipIf(!TEST_DB_URL)('save from Find Papers (Postgres)', () => {
  let db: TestDb;
  let user: string;

  beforeAll(async () => {
    db = await openTestDb();
    user = await db.addUser();
  });
  afterAll(async () => db?.close());

  it('fetches details from OpenAlex, not from the browser', async () => {
    const { client, get } = fakeClient((path) => (path === '/works/W100' ? work('W100') : new Error('unexpected')));
    const r = await saveFromSearch({ db: db.pool, client }, user, { paperId: 'W100', paper: { ...paper('W100'), title: 'Browser title' } });
    expect(get).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ pending: false, item: { addedVia: 'search', paper: { id: 'W100', title: 'Fresh W100', citedByCount: 12 } } });
  });

  it('refuses a second save without calling OpenAlex', async () => {
    const { client, get } = fakeClient(() => work('W100'));
    await expect(saveFromSearch({ db: db.pool, client }, user, { paperId: 'w100' })).rejects.toMatchObject({ code: 'duplicate', details: { itemId: expect.any(String) } });
    expect(get).not.toHaveBeenCalled();
  });

  it('reuses an existing shared record without calling OpenAlex', async () => {
    await putShared(db.pool, paper('W101'));
    const { client, get } = fakeClient(() => new Error('should not be called'));
    const r = await saveFromSearch({ db: db.pool, client }, user, { paperId: 'W101' });
    expect(get).not.toHaveBeenCalled();
    expect(r.item.paper.title).toBe('Paper W101');
  });

  it('when OpenAlex is down, keeps the details already shown and marks them for refresh', async () => {
    const { client } = fakeClient(() => new PapersError('unavailable', 'down'));
    const r = await saveFromSearch({ db: db.pool, client }, user, { paperId: 'W102', paper: paper('W102', { title: 'Shown title' }) });
    expect(r).toMatchObject({ pending: true, item: { paper: { title: 'Shown title' } } });
    const { rows } = await db.pool.query(`select "refreshDue" from shelf_paper where id = 'W102'`);
    expect(rows[0].refreshDue).toBe(true);
  });

  it('when OpenAlex is down and no details were sent, reports the outage', async () => {
    const { client } = fakeClient(() => new PapersError('unavailable', 'down'));
    await expect(saveFromSearch({ db: db.pool, client }, user, { paperId: 'W103' })).rejects.toMatchObject({ code: 'unavailable' });
    expect(await getPaper(db.pool, 'W103')).toBeNull();
  });

  it('does not fall back for a paper OpenAlex says does not exist', async () => {
    const { client } = fakeClient(() => new PapersError('not_found', 'gone'));
    await expect(saveFromSearch({ db: db.pool, client }, user, { paperId: 'W104', paper: paper('W104') })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('treats the same DOI as already saved, ignoring case and prefix', async () => {
    const own = await createPrivate(db.pool, user, { ...paper('X'), doi: '10.1000/w105' }, 'manual');
    await db.pool.query(`insert into shelf_item (id, "userId", "paperId", "addedVia") values ('i_manual', $1, $2, 'manual')`, [user, own.id]);
    const { client } = fakeClient(() => work('W105', { doi: 'https://doi.org/10.1000/W105' }));
    await expect(saveFromSearch({ db: db.pool, client }, user, { paperId: 'W105' })).rejects.toMatchObject({ code: 'duplicate', details: { itemId: 'i_manual' } });
  });

  it('saves into a chosen project, but only the user’s own', async () => {
    const other = await db.addUser();
    const theirs = await createProject(db.pool, other, 'Not yours');
    const mine = await createProject(db.pool, user, 'Thesis');
    const { client } = fakeClient((path) => work(path.split('/').pop()!));
    await expect(saveFromSearch({ db: db.pool, client }, user, { paperId: 'W106', projectId: theirs.id })).rejects.toMatchObject({ code: 'not_found' });
    const r = await saveFromSearch({ db: db.pool, client }, user, { paperId: 'W106', projectId: mine.id });
    expect((await getItem(db.pool, user, r.item.id))?.projectIds).toEqual([mine.id]);
  });

  it('rejects an invalid ID', async () => {
    const { client } = fakeClient(() => null);
    await expect(saveFromSearch({ db: db.pool, client }, user, { paperId: 'not-an-id' })).rejects.toMatchObject({ code: 'bad_request' });
  });
});
