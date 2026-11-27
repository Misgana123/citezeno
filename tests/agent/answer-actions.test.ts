import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { speakable, timeAgo } from '@/components/chat/answer-text';
import { applyEvent, type Entry } from '@/components/chat/events';
import { appendMessages, createConversation, dropAfterLastUserMessage, loadMessages, setFeedback } from '@/lib/agent/store';
import { toView } from '@/lib/agent/view';
import { openTestDb, TEST_DB_URL, type TestDb } from '../shelf/testdb';

/* The row under an answer: copy, read aloud, thumbs up or down, try again, and when. */

describe('the answer’s row', () => {
  const now = Date.parse('2026-11-24T15:00:00Z');
  it('says when an answer was written, in words', () => {
    expect(timeAgo('2026-11-24T14:59:30Z', now)).toBe('just now');
    expect(timeAgo('2026-11-24T14:55:00Z', now)).toBe('5 minutes ago');
    expect(timeAgo('2026-11-24T12:00:00Z', now)).toBe('3 hours ago');
    expect(timeAgo('2026-11-23T14:00:00Z', now)).toBe('1 day ago');
    expect(timeAgo('2026-11-10T15:00:00Z', now)).toBe('2 weeks ago');
    expect(timeAgo('2026-09-01T15:00:00Z', now)).toMatch(/Sep 1, 2026/);
  });

  it('reads an answer aloud as plain words: no markdown marks, citation numbers or code', () => {
    expect(speakable('## Findings\n\n**Sleep** helps memory [1][2]. See [the paper](https://doi.org/x).\n\n```py\nprint(1)\n```')).toBe('Findings Sleep helps memory . See the paper.');
  });

  it('keeps the saved number and time of a streamed answer, for its feedback', () => {
    const e = applyEvent([{ kind: 'user', text: 'Hi' }] as Entry[], { type: 'text', text: 'Hello.', seq: 2 });
    expect(e[1]).toMatchObject({ kind: 'assistant', text: 'Hello.', seq: 2 });
    expect(typeof (e[1] as { at?: string }).at).toBe('string');
  });
});

describe.skipIf(!TEST_DB_URL)('feedback and trying again (Postgres)', () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await openTestDb();
  });
  afterAll(() => t?.close());

  it('numbers saved messages, keeps a thumbs up on its answer, and only for the chat’s owner', async () => {
    const owner = await t.addUser();
    const other = await t.addUser();
    const c = await createConversation(t.pool, owner, 'Sleep', 'm');
    expect(await appendMessages(t.pool, c.id, [{ message: { role: 'user', text: 'Hi' } }, { message: { role: 'assistant', text: 'Hello.', toolCalls: [] } }])).toEqual([1, 2]);

    expect(await setFeedback(t.pool, other, c.id, 2, 'up')).toBe(false);
    expect(await setFeedback(t.pool, owner, c.id, 1, 'up')).toBe(false); // only answers
    expect(await setFeedback(t.pool, owner, c.id, 2, 'up')).toBe(true);
    const view = toView(c, await loadMessages(t.pool, c.id));
    expect(view.entries[1]).toMatchObject({ kind: 'assistant', text: 'Hello.', seq: 2, feedback: 'up' });
    expect(typeof (view.entries[1] as { at?: string }).at).toBe('string');
    await setFeedback(t.pool, owner, c.id, 2, null);
    expect((await loadMessages(t.pool, c.id))[1].feedback).toBeUndefined();
  });

  it('trying again drops everything after the last message the user sent', async () => {
    const owner = await t.addUser();
    const c = await createConversation(t.pool, owner, 'Retry', 'm');
    await appendMessages(t.pool, c.id, [
      { message: { role: 'user', text: 'First' } },
      { message: { role: 'assistant', text: 'One.', toolCalls: [] } },
      { message: { role: 'user', text: 'Second' } },
      { message: { role: 'assistant', text: '', toolCalls: [{ id: 'k', name: 'search_papers', input: {} }] } },
      { message: { role: 'tool', results: [{ callId: 'k', name: 'search_papers', content: '…' }] } },
      { message: { role: 'assistant', text: 'Two.', toolCalls: [] } },
    ]);
    expect(await dropAfterLastUserMessage(t.pool, await t.addUser(), c.id)).toBe(false); // not theirs
    expect(await dropAfterLastUserMessage(t.pool, owner, c.id)).toBe(true);
    expect((await loadMessages(t.pool, c.id)).map((m) => m.message.role)).toEqual(['user', 'assistant', 'user']);
    // the next answer gets the next number
    expect(await appendMessages(t.pool, c.id, [{ message: { role: 'assistant', text: 'Two again.', toolCalls: [] } }])).toEqual([4]);
  });
});
