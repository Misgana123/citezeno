import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AGENT_FILE_MAX_BYTES, agentFileName, getAgentFile, readShelfPdf, saveAgentFile } from '@/lib/agent/files';
import { createPending } from '@/lib/shelf/store/pdfs';
import { createConversation, deleteConversation } from '@/lib/agent/store';
import { memoryStore } from '@/lib/providers/storage/memory';
import { takeTrash } from '@/lib/shelf/store/pdfs';
import { openTestDb, TEST_DB_URL, type TestDb } from '../shelf/testdb';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const bytes = (n: number) => new Uint8Array(n).fill(7);

describe('naming files the assistant makes', () => {
  it('keeps a safe name ending in the type’s extension', () => {
    expect(agentFileName('Literature review', DOCX)).toBe('Literature review.docx');
    expect(agentFileName('review.docx', DOCX)).toBe('review.docx');
    expect(agentFileName('chart.txt', 'image/png')).toBe('chart.png');
    expect(agentFileName('../../etc/passwd', 'text/plain')).toBe('passwd.txt');
    expect(agentFileName('a<b>|c?.pdf', 'application/pdf')).toBe('a b c .pdf');
    expect(agentFileName('   ', 'application/pdf')).toBe('file.pdf');
  });
});

describe('saving without storage or over the limit', () => {
  it('says files aren’t set up when there is no storage', async () => {
    await expect(saveAgentFile({ db: null as never, store: null }, { userId: 'u', conversationId: 'c' }, { name: 'x', mime: 'text/plain', bytes: bytes(1) })).rejects.toMatchObject({
      code: 'unavailable',
    });
  });

  it('refuses a file over the size limit before storing anything', async () => {
    const store = memoryStore();
    await expect(saveAgentFile({ db: null as never, store }, { userId: 'u', conversationId: 'c' }, { name: 'x', mime: 'text/plain', bytes: bytes(AGENT_FILE_MAX_BYTES + 1) })).rejects.toMatchObject({
      code: 'too_large',
    });
  });
});

describe.skipIf(!TEST_DB_URL)('agent files (Postgres)', () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await openTestDb();
  });
  afterAll(async () => {
    await t?.close();
  });

  it('stores a file for its owner only, and trashes it with the conversation', async () => {
    const store = memoryStore();
    const owner = await t.addUser();
    const other = await t.addUser();
    const c = await createConversation(t.pool, owner, 'Chat', 'm');

    const ref = await saveAgentFile({ db: t.pool, store }, { userId: owner, conversationId: c.id }, { name: 'Report', mime: DOCX, bytes: bytes(10) });
    expect(ref).toMatchObject({ name: 'Report.docx', mime: DOCX, size: 10 });

    const row = await getAgentFile(t.pool, owner, ref.id);
    expect(row?.storageKey).toBe(`agent/${owner}/${c.id}/${ref.id}.docx`);
    expect(store.has(row!.storageKey)).toBe(true);
    expect(await getAgentFile(t.pool, other, ref.id)).toBeNull();

    expect(await deleteConversation(t.pool, owner, c.id)).toBe(true);
    expect(await getAgentFile(t.pool, owner, ref.id)).toBeNull();
    expect(await takeTrash(t.pool, 100)).toContain(row!.storageKey);
  });

  it('removes the stored file when its conversation is gone', async () => {
    const mem = memoryStore();
    const written: string[] = [];
    const store = { ...mem, write: async (key: string, b: Uint8Array, type: string) => (written.push(key), mem.write(key, b, type)) };
    const owner = await t.addUser();
    await expect(saveAgentFile({ db: t.pool, store }, { userId: owner, conversationId: 'c_missing' }, { name: 'x', mime: 'text/plain', bytes: bytes(3) })).rejects.toBeTruthy();
    expect(written).toHaveLength(1);
    expect(mem.has(written[0])).toBe(false);
  });

  it('reads a shelf PDF for its owner only, once its upload finished', async () => {
    const store = memoryStore();
    const owner = await t.addUser();
    const other = await t.addUser();
    const row = await createPending(t.pool, owner, { fileName: 'paper.pdf', sizeBytes: 5 });
    store.put(row.storageKey, bytes(5));
    expect(await readShelfPdf({ db: t.pool, store }, owner, row.id)).toBeNull(); // still uploading
    await t.pool.query(`update shelf_pdf set status = 'ready' where id = $1`, [row.id]);
    expect(await readShelfPdf({ db: t.pool, store }, owner, row.id)).toMatchObject({ fileName: 'paper.pdf' });
    expect(await readShelfPdf({ db: t.pool, store }, other, row.id)).toBeNull();
  });
});
