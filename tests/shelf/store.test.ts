import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { shelfConfig } from '@/lib/shelf/config';
import { ShelfError } from '@/lib/shelf/errors';
import { createFolder, deleteFolder, listFolders } from '@/lib/shelf/store/folders';
import { addItem, deleteItems, getItem, listItems, savedMap, setStatus, updateItem } from '@/lib/shelf/store/items';
import { addTags, addToFolder, addToProject, moveItems, removeFromProject, removeTags } from '@/lib/shelf/store/links';
import { buildListQuery, type ListQuery } from '@/lib/shelf/store/list-query';
import { createPrivate, ensureShared, getPaper, putShared } from '@/lib/shelf/store/papers';
import { createProject, deleteProject, findOrCreateProject, listProjects, renameProject } from '@/lib/shelf/store/projects';
import { createTag, findOrCreateTags, listTags } from '@/lib/shelf/store/tags';
import { paper } from './fixtures';
import { openTestDb, TEST_DB_URL, type TestDb } from './testdb';

const Q = (over: Partial<ListQuery> = {}): ListQuery => ({ sort: 'added_desc', page: 1, perPage: 25, ...over });

describe('shelf config', () => {
  it('has the agreed defaults and reads overrides', () => {
    const c = shelfConfig({});
    expect(c.pdfMaxBytes).toBe(10 * 1024 * 1024);
    expect(c.importMaxEntries).toBe(10_000);
    expect(shelfConfig({ SHELF_IMPORT_MAX_MB: '50' }).importMaxBytes).toBeLessThan(4.5 * 1024 * 1024);
    expect(shelfConfig({ SHELF_PDF_MAX_MB: '25', SHELF_UPLOADS_PER_DAY: 'nope' }).pdfMaxBytes).toBe(25 * 1024 * 1024);
    expect(shelfConfig({ SHELF_UPLOADS_PER_DAY: 'nope' }).uploadsPerDay).toBe(50);
  });
});

describe('list query builder', () => {
  it('always scopes to the user and passes every value as a parameter', () => {
    const b = buildListQuery('u1', Q({ project: "x' or 1=1 --", tag: 't1', status: 'done', yearFrom: 2000, openAccess: true }));
    expect(b.where.startsWith(`i."userId" = $1`)).toBe(true);
    expect(b.where).not.toContain('or 1=1');
    expect(b.values).toEqual(['u1', "x' or 1=1 --", 't1', 'done', 2000, true]);
  });

  it('pages and clamps', () => {
    expect(buildListQuery('u', Q({ page: 3, perPage: 10 }))).toMatchObject({ limit: 10, offset: 20 });
    expect(buildListQuery('u', Q({ page: 0, perPage: 1000 }))).toMatchObject({ limit: 100, offset: 0 });
    expect(buildListQuery('u', Q({ project: 'unsorted' })).values).toEqual(['u']);
  });
});

describe.skipIf(!TEST_DB_URL)('shelf stores (Postgres)', () => {
  let db: TestDb;
  let alice: string;
  let bob: string;

  beforeAll(async () => {
    db = await openTestDb();
    alice = await db.addUser();
    bob = await db.addUser();
  });
  afterAll(async () => db?.close());

  describe('paper records', () => {
    it('shares one record per OpenAlex paper and refreshes it', async () => {
      const first = await putShared(db.pool, paper('openalex:W1', { citedByCount: 1 }));
      expect(first).toMatchObject({ id: 'openalex:W1', provider: 'openalex', origin: 'provider', citedByCount: 1, doi: '10.1000/w1' });
      await putShared(db.pool, paper('openalex:W1', { citedByCount: 9, isRetracted: true }));
      expect(await getPaper(db.pool, 'openalex:W1')).toMatchObject({ citedByCount: 9, isRetracted: true });
    });

    it('never overwrites a record with unconfirmed details, and marks new ones for refresh', async () => {
      await ensureShared(db.pool, paper('openalex:W1', { title: 'Poisoned' }));
      expect((await getPaper(db.pool, 'openalex:W1'))?.title).toBe('Paper W1');
      const fresh = await ensureShared(db.pool, paper('openalex:W2'));
      expect(fresh.id).toBe('openalex:W2');
      const { rows } = await db.pool.query(`select "refreshDue" from shelf_paper where id = 'openalex:W2'`);
      expect(rows[0].refreshDue).toBe(true);
    });

    it('keeps private papers private', async () => {
      const own = await createPrivate(db.pool, alice, paper('X', { doi: null }), 'manual');
      expect(own.id.startsWith('p_')).toBe(true);
      expect(own).toMatchObject({ provider: null, origin: 'manual', title: 'Paper X' });
    });
  });

  describe('items', () => {
    it('saves once; a second save returns the existing item', async () => {
      const a = await addItem(db.pool, alice, 'openalex:W1', 'search');
      expect(a.created).toBe(true);
      const again = await addItem(db.pool, alice, 'openalex:W1', 'doi');
      expect(again).toMatchObject({ created: false, item: { id: a.item.id, addedVia: 'search' } });
      expect(a.item).toMatchObject({ readingStatus: 'to_read', note: null, projectIds: [], paper: { id: 'openalex:W1' } });
    });

    it('lets two users save the same shared paper', async () => {
      const b = await addItem(db.pool, bob, 'openalex:W1', 'search');
      expect(b.created).toBe(true);
      expect(await savedMap(db.pool, bob, ['openalex:W1', 'openalex:W2'])).toEqual({ 'openalex:W1': b.item.id });
    });

    it('only the owner can read, change or delete an item', async () => {
      const { item } = await addItem(db.pool, alice, 'openalex:W2', 'search');
      expect(await getItem(db.pool, bob, item.id)).toBeNull();
      expect(await updateItem(db.pool, bob, item.id, { note: 'hi' })).toBeNull();
      expect(await deleteItems(db.pool, bob, [item.id])).toEqual({ deleted: [] });
      expect(await setStatus(db.pool, bob, [item.id], 'done')).toBe(0);
      const mine = await updateItem(db.pool, alice, item.id, { note: 'Read the methods', readingStatus: 'reading' });
      expect(mine).toMatchObject({ note: 'Read the methods', readingStatus: 'reading' });
      expect((await updateItem(db.pool, alice, item.id, { note: '   ' }))?.note).toBeNull();
    });

    it('deleting an item keeps the shared record but removes an unused private one', async () => {
      const shared = await addItem(db.pool, alice, 'openalex:W2', 'search');
      await deleteItems(db.pool, alice, [shared.item.id]);
      expect(await getPaper(db.pool, 'openalex:W2')).not.toBeNull();

      const own = await createPrivate(db.pool, alice, paper('Y', { doi: null }), 'manual');
      const item = await addItem(db.pool, alice, own.id, 'manual');
      await deleteItems(db.pool, alice, [item.item.id]);
      expect(await getPaper(db.pool, own.id)).toBeNull();
    });
  });

  describe('projects, folders and tags', () => {
    it('keeps names unique per user, ignoring case', async () => {
      await createProject(db.pool, alice, 'Thesis');
      await expect(createProject(db.pool, alice, 'thesis')).rejects.toMatchObject({ code: 'name_taken' });
      await expect(createProject(db.pool, bob, 'Thesis')).resolves.toMatchObject({ name: 'Thesis' });
      expect((await findOrCreateProject(db.pool, alice, 'THESIS')).name).toBe('Thesis');
    });

    it('will not create a folder in another user’s project', async () => {
      const p = await createProject(db.pool, alice, 'Private project');
      await expect(createFolder(db.pool, bob, p.id, 'Sneaky')).rejects.toBeInstanceOf(ShelfError);
      await expect(createFolder(db.pool, alice, p.id, 'Chapter 1')).resolves.toMatchObject({ projectId: p.id });
    });

    it('will not link items and groups across users', async () => {
      const aliceItem = (await addItem(db.pool, alice, 'openalex:W2', 'search')).item;
      const bobItem = (await addItem(db.pool, bob, 'openalex:W2', 'search')).item;
      const aliceProject = await createProject(db.pool, alice, 'Climate essay');
      const bobTag = await createTag(db.pool, bob, 'bob-only');
      expect(await addToProject(db.pool, bob, [aliceItem.id], aliceProject.id)).toBe(0);
      expect(await addToProject(db.pool, alice, [bobItem.id], aliceProject.id)).toBe(0);
      expect(await addTags(db.pool, alice, [aliceItem.id], [bobTag.id])).toBe(0);
      expect(await renameProject(db.pool, bob, aliceProject.id, 'Mine now')).toBe(false);
      expect(await deleteProject(db.pool, bob, aliceProject.id)).toBe(false);
    });

    it('a folder brings its project; leaving the project leaves its folders', async () => {
      const item = (await addItem(db.pool, alice, 'openalex:W1', 'search')).item;
      const p = await createProject(db.pool, alice, 'Folders test');
      const f = await createFolder(db.pool, alice, p.id, 'Methods');
      await addToFolder(db.pool, alice, [item.id], f.id);
      expect(await getItem(db.pool, alice, item.id)).toMatchObject({ projectIds: [p.id], folderIds: [f.id] });
      await removeFromProject(db.pool, alice, [item.id], p.id);
      expect(await getItem(db.pool, alice, item.id)).toMatchObject({ projectIds: [], folderIds: [] });
      await addToFolder(db.pool, alice, [item.id], f.id);
      await deleteFolder(db.pool, alice, f.id);
      expect(await getItem(db.pool, alice, item.id)).toMatchObject({ projectIds: [p.id], folderIds: [] });
      expect((await listFolders(db.pool, alice)).find((x) => x.id === f.id)).toBeUndefined();
    });

    it('moves items between projects and back to Unsorted', async () => {
      const item = (await addItem(db.pool, alice, 'openalex:W1', 'search')).item;
      const a = await findOrCreateProject(db.pool, alice, 'Move A');
      const b = await findOrCreateProject(db.pool, alice, 'Move B');
      await addToProject(db.pool, alice, [item.id], a.id);
      await moveItems(db.pool, alice, [item.id], { projectId: b.id });
      expect((await getItem(db.pool, alice, item.id))?.projectIds).toEqual([b.id]);
      await moveItems(db.pool, alice, [item.id], {});
      expect((await getItem(db.pool, alice, item.id))?.projectIds).toEqual([]);
    });

    it('creates tags by name once and counts their papers', async () => {
      const item = (await addItem(db.pool, alice, 'openalex:W1', 'search')).item;
      const tags = await findOrCreateTags(db.pool, alice, ['methods', 'Methods', ' important ']);
      expect(tags.map((t) => t.name).sort()).toEqual(['important', 'methods']);
      expect(await findOrCreateTags(db.pool, alice, ['METHODS'])).toHaveLength(1);
      await addTags(db.pool, alice, [item.id], tags.map((t) => t.id));
      expect((await listTags(db.pool, alice)).find((t) => t.name === 'methods')?.count).toBe(1);
      await removeTags(db.pool, alice, [item.id], [tags[0].id]);
      expect((await getItem(db.pool, alice, item.id))?.tagIds).toHaveLength(1);
      const projects = await listProjects(db.pool, alice);
      expect(projects.every((p) => typeof p.count === 'number')).toBe(true);
    });
  });

  describe('listing', () => {
    it('filters, sorts, pages and never shows another user’s items', async () => {
      const carol = await db.addUser();
      for (const [id, year, cites] of [['openalex:W10', 2001, 3], ['openalex:W11', 2015, 50], ['openalex:W12', 2010, 7]] as const) {
        await putShared(db.pool, paper(id, { year, citedByCount: cites }));
        await addItem(db.pool, carol, id, 'search');
      }
      const p = await createProject(db.pool, carol, 'Only one');
      const all = await listItems(db.pool, carol, Q());
      expect(all.total).toBe(3);
      await addToProject(db.pool, carol, [all.items.find((i) => i.paper.id === 'openalex:W11')!.id], p.id);

      expect((await listItems(db.pool, carol, Q({ sort: 'year_asc' }))).items.map((i) => i.paper.id)).toEqual(['openalex:W10', 'openalex:W12', 'openalex:W11']);
      expect((await listItems(db.pool, carol, Q({ sort: 'cited' }))).items[0].paper.id).toBe('openalex:W11');
      expect((await listItems(db.pool, carol, Q({ project: p.id }))).items.map((i) => i.paper.id)).toEqual(['openalex:W11']);
      expect((await listItems(db.pool, carol, Q({ project: 'unsorted' }))).total).toBe(2);
      expect((await listItems(db.pool, carol, Q({ yearFrom: 2005, yearTo: 2012 }))).items.map((i) => i.paper.id)).toEqual(['openalex:W12']);
      const page2 = await listItems(db.pool, carol, Q({ sort: 'year_asc', perPage: 2, page: 2 }));
      expect(page2).toMatchObject({ total: 3, page: 2 });
      expect(page2.items.map((i) => i.paper.id)).toEqual(['openalex:W11']);
      expect((await listItems(db.pool, carol, Q({ project: (await listProjects(db.pool, alice))[0].id }))).total).toBe(0);
    });
  });

  describe('account deletion', () => {
    it('removes the whole shelf but keeps shared paper records', async () => {
      const dave = await db.addUser();
      const own = await createPrivate(db.pool, dave, paper('Z', { doi: null }), 'manual');
      await addItem(db.pool, dave, own.id, 'manual');
      const item = (await addItem(db.pool, dave, 'openalex:W1', 'search')).item;
      const p = await createProject(db.pool, dave, 'Gone');
      await addToProject(db.pool, dave, [item.id], p.id);
      await findOrCreateTags(db.pool, dave, ['gone']);

      await db.pool.query(`delete from "user" where id = $1`, [dave]);

      for (const table of ['shelf_item', 'shelf_project', 'shelf_tag', 'shelf_folder']) {
        const { rows } = await db.pool.query(`select count(*)::int as n from ${table} where "userId" = $1`, [dave]);
        expect(rows[0].n, table).toBe(0);
      }
      expect(await getPaper(db.pool, own.id)).toBeNull();
      expect(await getPaper(db.pool, 'openalex:W1')).not.toBeNull();
    });
  });
});
