import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { countShareView, openSharedChat, publicEntries, shareConversation, shareState, unshareConversation } from '@/lib/agent/share';
import { appendMessages, createConversation } from '@/lib/agent/store';
import type { StoredMessage } from '@/lib/agent/types';
import type { ShelfItem } from '@/lib/shelf/types';
import { openTestDb, TEST_DB_URL, type TestDb } from '../shelf/testdb';

/* Sharing a chat: a read-only public snapshot that keeps private things private. */

const item = {
  id: 'i1', paper: { id: 'openalex:W1', title: 'Sleep and memory', authors: [], year: 2020 }, addedAt: '2026-01-01T00:00:00Z', addedVia: 'search',
  readingStatus: 'reading', note: 'my private note', projectIds: ['p1'], folderIds: ['f1'], tagIds: ['t1'], pdfs: [{ id: 'pdf1', fileName: 'mine.pdf', sizeBytes: 1, pageCount: 1, textStatus: 'done' }], reading: { page: 3, pageCount: 9 },
} as unknown as ShelfItem;

const conversation: StoredMessage[] = [
  { message: { role: 'user', text: 'What is on my shelf about sleep?', attachments: [{ kind: 'image', name: 'notes.png', mediaType: 'image/png', data: 'AAAA' }] } },
  { message: { role: 'assistant', text: '', toolCalls: [{ id: 'k1', name: 'list_library', input: { search: 'sleep' } }] } },
  {
    message: { role: 'tool', results: [{ callId: 'k1', name: 'list_library', content: '…' }] },
    ui: [
      {
        callId: 'k1', name: 'list_library', label: 'Searching your shelf for “sleep”', input: { search: 'sleep' }, status: 'done', kind: 'shelf', line: { did: 'Searched your shelf', about: 'sleep' },
        display: { items: [item], summary: '1 paper', file: { id: 'f_secret', name: 'export.bib', mime: 'text/plain', size: 9 }, files: [{ id: 'f_chart', name: 'chart.png', mime: 'image/png', size: 9 }] },
      },
    ],
  },
  { message: { role: 'assistant', text: 'You have one paper on sleep [1].', toolCalls: [] } },
];

describe('what a shared chat shows', () => {
  it('keeps the words and what the steps found, and drops attachments’ contents, files, step inputs and shelf details', () => {
    const entries = publicEntries(conversation);
    expect(entries.map((e) => e.kind)).toEqual(['user', 'steps', 'assistant']);
    expect(entries[0]).toEqual({ kind: 'user', text: 'What is on my shelf about sleep?', attachments: [{ kind: 'image', name: 'notes.png' }] });
    const step = (entries[1] as Extract<(typeof entries)[number], { kind: 'steps' }>).steps[0];
    expect(step.input).toEqual({});
    expect(step.line).toEqual({ did: 'Searched your shelf', about: 'sleep' });
    expect(step.display?.file).toBeUndefined();
    expect(step.display?.files).toBeUndefined();
    const shown = step.display!.items![0];
    expect(shown.paper.title).toBe('Sleep and memory');
    expect([shown.note, shown.projectIds, shown.tagIds, shown.pdfs, shown.reading]).toEqual([null, [], [], [], null]);
    expect(JSON.stringify(entries)).not.toMatch(/private note|mine\.pdf|AAAA|f_secret|f_chart/);
  });
});

describe.skipIf(!TEST_DB_URL)('sharing a chat (Postgres)', () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await openTestDb();
    await t.pool.query(`alter table "user" add column name text`);
  });
  afterAll(() => t?.close());

  it('makes a snapshot link, keeps later messages private until updated, and stops', async () => {
    const owner = await t.addUser();
    await t.pool.query(`update "user" set name = 'Ada' where id = $1`, [owner]);
    const other = await t.addUser();
    const c = await createConversation(t.pool, owner, 'Sleep', 'm');
    await appendMessages(t.pool, c.id, conversation);

    expect(await shareState(t.pool, owner, c.id)).toEqual({ shared: false });
    expect(await shareConversation(t.pool, other, c.id)).toBeNull(); // only the owner can share
    const s = await shareConversation(t.pool, owner, c.id);
    expect(s).toMatchObject({ shared: true, views: 0, behind: false });
    const token = (s as { url: string }).url.split('/c/')[1];

    const open = await openSharedChat(t.pool, token);
    expect(open).toMatchObject({ title: 'Sleep', owner: 'Ada' });
    expect(open!.entries.at(-1)).toEqual({ kind: 'assistant', text: 'You have one paper on sleep [1].' });

    // a later message isn't shared until the link is updated, and the address stays the same
    await appendMessages(t.pool, c.id, [{ message: { role: 'user', text: 'And something private?' } }]);
    expect(await shareState(t.pool, owner, c.id)).toMatchObject({ behind: true });
    expect(JSON.stringify((await openSharedChat(t.pool, token))!.entries)).not.toContain('something private');
    const updated = await shareConversation(t.pool, owner, c.id);
    expect(updated).toMatchObject({ shared: true, behind: false, url: (s as { url: string }).url });
    expect(JSON.stringify((await openSharedChat(t.pool, token))!.entries)).toContain('something private');

    await countShareView(t.pool, token);
    expect(await shareState(t.pool, owner, c.id)).toMatchObject({ views: 1 });

    expect(await unshareConversation(t.pool, owner, c.id)).toBe(true);
    expect(await openSharedChat(t.pool, token)).toBeNull();
    expect(await shareState(t.pool, owner, c.id)).toEqual({ shared: false });
    expect(await openSharedChat(t.pool, 'not a token')).toBeNull();
  });
});
