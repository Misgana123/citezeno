import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bulkBody } from '@/lib/shelf/api/bodies';
import { runBulk } from '@/lib/shelf/service/bulk';
import { shelfCounts } from '@/lib/shelf/store/counts';
import { createFolder } from '@/lib/shelf/store/folders';
import { addItem, getItem } from '@/lib/shelf/store/items';
import { putShared } from '@/lib/shelf/store/papers';
import { createProject } from '@/lib/shelf/store/projects';
import { listTags } from '@/lib/shelf/store/tags';
import { paper } from './fixtures';
import { openTestDb, TEST_DB_URL, type TestDb } from './testdb';

describe('bulk request bodies', () => {
  it('accepts each action and rejects empty or huge selections', () => {
    expect(bulkBody.safeParse({ action: 'status', ids: ['i1'], status: 'done' }).success).toBe(true);
    expect(bulkBody.safeParse({ action: 'move', ids: ['i1'], projectId: null }).success).toBe(true);
    expect(bulkBody.safeParse({ action: 'tag', ids: ['i1'], tagNames: ['methods'] }).success).toBe(true);
    expect(bulkBody.safeParse({ action: 'status', ids: [], status: 'done' }).success).toBe(false);
    expect(bulkBody.safeParse({ action: 'delete', ids: Array.from({ length: 501 }, (_, i) => `i${i}`) }).success).toBe(false);
    expect(bulkBody.safeParse({ action: 'explode', ids: ['i1'] }).success).toBe(false);
  });
});

describe.skipIf(!TEST_DB_URL)('bulk actions (Postgres)', () => {
  let db: TestDb;
  let user: string;
  let other: string;
  let ids: string[];
  let foreign: string;

  beforeAll(async () => {
    db = await openTestDb();
    user = await db.addUser();
    other = await db.addUser();
    ids = [];
    for (const id of ['openalex:W1', 'openalex:W2', 'openalex:W3']) {
      await putShared(db.pool, paper(id));
      ids.push((await addItem(db.pool, user, id, 'search')).item.id);
    }
    foreign = (await addItem(db.pool, other, 'openalex:W1', 'search')).item.id;
  });
  afterAll(async () => db?.close());

  it('sets status on the user’s items and skips anyone else’s', async () => {
    const r = await runBulk(db.pool, user, { action: 'status', ids: [...ids, foreign], status: 'done' });
    expect(r.items.map((i) => i.readingStatus)).toEqual(['done', 'done', 'done']);
    expect((await getItem(db.pool, other, foreign))?.readingStatus).toBe('to_read');
  });

  it('tags by name (creating the tag once) and untags', async () => {
    await runBulk(db.pool, user, { action: 'tag', ids, tagIds: [], tagNames: ['Important'] });
    const r = await runBulk(db.pool, user, { action: 'tag', ids: [ids[0]], tagIds: [], tagNames: ['important'] });
    const tags = await listTags(db.pool, user);
    expect(tags).toHaveLength(1);
    expect(tags[0]).toMatchObject({ name: 'Important', count: 3 });
    expect(r.items[0].tagIds).toEqual([tags[0].id]);
    await runBulk(db.pool, user, { action: 'untag', ids, tagIds: [tags[0].id] });
    expect((await listTags(db.pool, user))[0].count).toBe(0);
  });

  it('moves into a folder (and so its project), adds and removes', async () => {
    const p = await createProject(db.pool, user, 'Thesis');
    const q = await createProject(db.pool, user, 'Essay');
    const f = await createFolder(db.pool, user, p.id, 'Methods');
    await runBulk(db.pool, user, { action: 'move', ids: ids.slice(0, 2), folderId: f.id });
    expect(await getItem(db.pool, user, ids[0])).toMatchObject({ projectIds: [p.id], folderIds: [f.id] });
    await runBulk(db.pool, user, { action: 'add_project', ids: [ids[0]], projectId: q.id });
    expect((await getItem(db.pool, user, ids[0]))?.projectIds.sort()).toEqual([p.id, q.id].sort());
    expect(await shelfCounts(db.pool, user)).toMatchObject({ all: 3, unsorted: 1 });
    await runBulk(db.pool, user, { action: 'move', ids: [ids[0]], projectId: null, folderId: null });
    expect(await getItem(db.pool, user, ids[0])).toMatchObject({ projectIds: [], folderIds: [] });
  });

  it('refuses to move into a project the user does not own', async () => {
    const theirs = await createProject(db.pool, other, 'Theirs');
    await expect(runBulk(db.pool, user, { action: 'move', ids, projectId: theirs.id })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('deletes only the user’s items and reports which', async () => {
    const r = await runBulk(db.pool, user, { action: 'delete', ids: [ids[2], foreign] });
    expect(r.deleted).toEqual([ids[2]]);
    expect(await getItem(db.pool, other, foreign)).not.toBeNull();
  });
});
