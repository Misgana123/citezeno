import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyEvent, type Entry } from '@/components/chat/events';
import { toView } from '@/lib/agent/view';
import { publicEntries } from '@/lib/agent/share';
import { createWallet, type Wallet } from '@/lib/credits/wallet';
import { openTestDb, TEST_DB_URL, type TestDb } from '../shelf/testdb';

const conv = { id: 'c', title: 't', model: 'm', pinned: false, webSearch: false, pending: null, costUsd: 0, createdAt: '', updatedAt: '' };

describe('receipts on answers', () => {
  it('puts a reply’s bill on its last answer as it arrives', () => {
    let entries: Entry[] = [];
    entries = applyEvent(entries, { type: 'text', text: 'One' });
    entries = applyEvent(entries, { type: 'step', callId: 'c1', name: 'web_search', label: 'Searching', input: {} });
    entries = applyEvent(entries, { type: 'text', text: 'Two' });
    entries = applyEvent(entries, { type: 'credits', charged: 4 });
    expect(entries.filter((e) => e.kind === 'assistant').map((e) => (e as { credits?: number }).credits)).toEqual([undefined, 4]);
  });

  it('shows the saved bill when a chat is reopened, but never on a public link', () => {
    const messages = [
      { message: { role: 'user' as const, text: 'Hi' } },
      { message: { role: 'assistant' as const, text: 'Hello', toolCalls: [] }, meta: { scope: 'assistant' as const, credits: 2, actionId: 'a1' } },
    ];
    expect(toView(conv, messages).entries.at(-1)).toMatchObject({ kind: 'assistant', credits: 2 });
    expect(publicEntries(messages).at(-1)).toEqual({ kind: 'assistant', text: 'Hello' });
  });
});

describe.skipIf(!TEST_DB_URL)('support refunds', { timeout: 60_000 }, () => {
  let db: TestDb;
  let w: Wallet;
  beforeAll(async () => {
    db = await openTestDb();
    w = createWallet(db.pool);
  });
  afterAll(async () => db?.close());

  it('gives back what an action was charged, once', async () => {
    const u = await db.addUser();
    await w.grant({ userId: u, source: 'plan', amount: 10, expiresAt: new Date(Date.now() + 86_400_000), ref: `g:${u}` });
    const h = await w.hold({ userId: u, kind: 'assistant', amount: 5, ttlMs: 60_000 });
    await w.settle({ actionId: h.actionId, credits: 5, outcome: 'finished' });
    expect(await w.refundAction(h.actionId, 'admin@example.com')).toBe(5);
    expect(await w.refundAction(h.actionId, 'admin@example.com')).toBe(0);
    expect((await w.balance(u)).total).toBe(10);
  });
});
