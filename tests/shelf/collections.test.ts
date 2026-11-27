import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseListRequest } from '@/lib/shelf/api/list-request';
import { shelfCounts } from '@/lib/shelf/store/counts';
import { addItem, getItem, listItems } from '@/lib/shelf/store/items';
import { buildListQuery, type ListQuery } from '@/lib/shelf/store/list-query';
import { createPrivate, putShared } from '@/lib/shelf/store/papers';
import { collectionOf } from '@/lib/shelf/types';
import { paper } from './fixtures';
import { openTestDb, TEST_DB_URL, type TestDb } from './testdb';

/* The shelf's two collections: My uploads (added with a PDF) and Library (everything else). */

const Q = (over: Partial<ListQuery> = {}): ListQuery => ({ sort: 'added_desc', page: 1, perPage: 25, ...over });

describe('collections', () => {
  it('an entry belongs to My uploads only when it was added with a PDF', () => {
    expect(collectionOf('upload')).toBe('uploads');
    for (const via of ['search', 'doi', 'link', 'title', 'import', 'manual'] as const) expect(collectionOf(via)).toBe('library');
  });

  it('the list query filters by collection with fixed SQL, no extra parameters', () => {
    const up = buildListQuery('u', Q({ collection: 'uploads' }));
    expect(up.where).toContain(`i."addedVia" = 'upload'`);
    expect(up.values).toEqual(['u']);
    expect(buildListQuery('u', Q({ collection: 'library' })).where).toContain(`i."addedVia" <> 'upload'`);
    expect(buildListQuery('u', Q()).where).not.toContain('addedVia');
  });

  it('My uploads can be narrowed to matched papers, own documents, or ones being read', () => {
    expect(buildListQuery('u', Q({ matched: true })).where).toContain(`p.origin = 'provider'`);
    expect(buildListQuery('u', Q({ matched: false })).where).toContain(`p.origin <> 'provider'`);
    expect(buildListQuery('u', Q({ inProgress: true })).where).toContain('reader_position');
    expect(buildListQuery('u', Q({ matched: true, inProgress: true })).values).toEqual(['u']);
    const r = parseListRequest(new URLSearchParams('c=uploads&matched=0&wip=1'));
    expect(r).toMatchObject({ collection: 'uploads', matched: false, inProgress: true });
  });

  it('the request takes c=library or c=uploads and rejects anything else', () => {
    expect(parseListRequest(new URLSearchParams('c=uploads')).collection).toBe('uploads');
    expect(parseListRequest(new URLSearchParams('c=library')).collection).toBe('library');
    expect(parseListRequest(new URLSearchParams('')).collection).toBeUndefined();
    expect(() => parseListRequest(new URLSearchParams("c=uploads' or 1=1"))).toThrow();
  });
});

describe.skipIf(!TEST_DB_URL)('collections (Postgres)', () => {
  let db: TestDb;
  let alice: string;
  let bob: string;
  let found: string;
  let upload: string;
  let ownDoc: string;

  beforeAll(async () => {
    db = await openTestDb();
    alice = await db.addUser();
    bob = await db.addUser();
    await putShared(db.pool, paper('openalex:C1'));
    await putShared(db.pool, paper('openalex:C2'));
    found = (await addItem(db.pool, alice, 'openalex:C1', 'search')).item.id;
    upload = (await addItem(db.pool, alice, 'openalex:C2', 'upload')).item.id;
    const own = await createPrivate(db.pool, alice, paper('Lecture notes', { doi: null }), 'manual');
    ownDoc = (await addItem(db.pool, alice, own.id, 'upload')).item.id;
    await addItem(db.pool, bob, 'openalex:C2', 'upload');
  });
  afterAll(async () => db?.close());

  it('lists each collection on its own, never another user’s items', async () => {
    const lib = await listItems(db.pool, alice, Q({ collection: 'library' }));
    expect(lib.items.map((i) => i.id)).toEqual([found]);
    const up = await listItems(db.pool, alice, Q({ collection: 'uploads' }));
    expect(up.items.map((i) => i.id).sort()).toEqual([upload, ownDoc].sort());
    expect(up.total).toBe(2);
    expect((await listItems(db.pool, alice, Q())).total).toBe(3);
  });

  it('counts both collections', async () => {
    expect(await shelfCounts(db.pool, alice)).toMatchObject({ all: 3, library: 1, uploads: 2 });
    expect(await shelfCounts(db.pool, bob)).toMatchObject({ all: 1, library: 0, uploads: 1 });
  });

  it('filters uploads by matched and in progress', async () => {
    const ids = async (over: Partial<ListQuery>) => (await listItems(db.pool, alice, Q({ collection: 'uploads', ...over }))).items.map((i) => i.id);
    expect(await ids({ matched: true })).toEqual([upload]);
    expect(await ids({ matched: false })).toEqual([ownDoc]);
    expect(await ids({ inProgress: true })).toEqual([]);
  });

  it('carries where the reader was left, or null', async () => {
    expect((await getItem(db.pool, alice, upload))?.reading).toBeNull();
    await db.pool.query(`insert into reader_position ("userId", "paperId", page, "pageCount") values ($1, 'openalex:C2', 6, 18)`, [alice]);
    expect((await getItem(db.pool, alice, upload))?.reading).toEqual({ page: 6, pageCount: 18 });
    expect((await listItems(db.pool, alice, Q({ inProgress: true }))).items.map((i) => i.id)).toEqual([upload]);
    // bob's copy of the same paper has his own (no) position
    const bobs = await listItems(db.pool, bob, Q({ collection: 'uploads' }));
    expect(bobs.items[0].reading).toBeNull();
  });
});
