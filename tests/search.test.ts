import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appendMessages, createConversation } from '@/lib/agent/store';
import { savePosition, touchPosition } from '@/lib/reader/store/positions';
import { search, snippetAround } from '@/lib/search';
import { addItem } from '@/lib/shelf/store/items';
import { putShared } from '@/lib/shelf/store/papers';
import { paper } from './shelf/fixtures';
import { openTestDb, TEST_DB_URL, type TestDb } from './shelf/testdb';

describe('search snippets', () => {
  it('shows the words in their place, trimmed', () => {
    const text = 'We looked at many things. Then sleep deprivation clearly impaired memory consolidation in all groups we studied over the summer.';
    expect(snippetAround(text, 'memory consolidation')).toMatch(/^….*memory consolidation.*…$/);
    expect(snippetAround(text, 'nowhere')).toBeNull();
    expect(snippetAround(null, 'x')).toBeNull();
  });
});

describe.skipIf(!TEST_DB_URL)('search (Postgres)', () => {
  let db: TestDb;
  let user: string;
  let other: string;

  beforeAll(async () => {
    db = await openTestDb();
    user = await db.addUser();
    other = await db.addUser();
    // the studio's saved drafts (the app's trace table, reduced to what search reads)
    await db.pool.query(`create table trace ("userId" text not null, id text not null, title text not null, snippet text, "savedAt" timestamptz not null default now(), primary key ("userId", id))`);
    await db.pool.query(`insert into trace ("userId", id, title, snippet) values ($1, 't1', 'Climate essay', 'Sea levels rose 20 cm over the century'), ($2, 't2', 'Secret climate draft', 'not yours')`, [user, other]);

    const c1 = await createConversation(db.pool, user, 'Sleep papers', 'm');
    await appendMessages(db.pool, c1.id, [{ message: { role: 'user', text: 'find work on spindles and memory' } }]);
    await createConversation(db.pool, user, 'Exports', 'm');
    await createConversation(db.pool, other, 'Spindles, someone else', 'm');

    await putShared(db.pool, paper('W70', { title: 'Sleep spindles and overnight memory' }));
    await addItem(db.pool, user, 'openalex:W70', 'search');
  });
  afterAll(async () => db?.close());

  it('finds chats by title and by what was said, with the matching words', async () => {
    const r = await search(db.pool, user, 'spindles', 'chats');
    expect(r.chats).toEqual([expect.objectContaining({ title: 'Sleep papers', snippet: expect.stringContaining('spindles and memory') })]);
    expect((await search(db.pool, user, 'export', 'chats')).chats.map((c) => c.title)).toEqual(['Exports']);
  });

  it('finds shelf papers and drafts, and only the user’s own', async () => {
    const r = await search(db.pool, user, 'climate', 'all');
    expect(r.drafts.map((d) => d.title)).toEqual(['Climate essay']);
    expect((await search(db.pool, user, 'spindles', 'papers')).papers).toEqual([expect.objectContaining({ title: 'Sleep spindles and overnight memory', retracted: false })]);
    expect((await search(db.pool, other, 'sleep', 'all')).papers).toEqual([]);
  });

  it('gives each shelf paper its paper ID, and lists papers opened in the reader', async () => {
    expect((await search(db.pool, user, 'spindles', 'papers')).papers[0].paperId).toBe('openalex:W70');
    await touchPosition(db.pool, user, 'openalex:W70', 'Sleep spindles and overnight memory');
    await savePosition(db.pool, user, 'openalex:W70', 4, 12);
    expect((await search(db.pool, user, '', 'all')).reading).toEqual([expect.objectContaining({ paperId: 'openalex:W70', page: 4, pageCount: 12 })]);
    expect((await search(db.pool, user, 'overnight', 'all')).reading).toHaveLength(1);
    expect((await search(db.pool, user, 'climate', 'all')).reading).toEqual([]);
    expect((await search(db.pool, other, '', 'all')).reading).toEqual([]);
  });

  it('lists recent things with no words, and takes % literally', async () => {
    const r = await search(db.pool, user, '', 'all');
    expect(r.chats.length).toBe(2);
    expect(r.drafts.length).toBe(1);
    expect((await search(db.pool, user, '%', 'chats')).chats).toEqual([]);
  });
});

describe('search snippets from replies', () => {
  it('drops markdown marks and citation numbers', () => {
    expect(snippetAround('- Sleep loss [2] (**retracted**, so treat it with care)', 'retracted')).toBe('Sleep loss (retracted, so treat it with care)');
  });
});
