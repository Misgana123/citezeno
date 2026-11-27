import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AgentContext } from '@/lib/agent/context';
import { codeRunner } from '@/lib/agent/sandbox';
import { createConversation, getSandboxId } from '@/lib/agent/store';
import { mimeFor } from '@/lib/agent/tools/code';
import { runTool } from '@/lib/agent/tools/run';
import type { CodeRequest, CodeRun, CodeSandbox } from '@/lib/providers/code-sandbox/types';
import { shelfConfig } from '@/lib/shelf/config';
import { openTestDb, TEST_DB_URL, type TestDb } from '../shelf/testdb';

const run = (over: Partial<CodeRun> = {}): CodeRun => ({ sessionId: 'sb_1', stdout: 'mean 3.5\n', stderr: '', error: null, outputs: [], files: [], missing: [], ...over });

function ctx(result: Partial<CodeRun> = {}, opts: { code?: boolean } = {}) {
  const requests: Omit<CodeRequest, 'sessionId'>[] = [];
  const saved: { name: string; mime: string; bytes: Uint8Array }[] = [];
  const c = {
    userId: 'u1',
    db: null as never,
    sources: () => null as never,
    papersConfig: { maxQueryChars: 1500, dailySearchesPerUser: 100 },
    shelfConfig: shelfConfig({}),
    reserveSearches: async () => {},
    webSearch: () => null,
    webFiles: () => null as never,
    pdfText: () => null as never,
    chatAttachments: async () => [{ kind: 'text' as const, name: 'data.csv', text: 'a,b\n1,2' }],
    code: () => (opts.code === false ? null : { run: async (r: Omit<CodeRequest, 'sessionId'>) => (requests.push(r), { ...run(result), newSession: false }) }),
    files: {
      save: async (f: { name: string; mime: string; bytes: Uint8Array }) => (saved.push(f), { id: `af_${saved.length}`, name: f.name, mime: f.mime, size: f.bytes.byteLength }),
      read: async (id: string) => (id === 'af_doc' ? { file: { id, name: 'report.pdf', mime: 'application/pdf', size: 3 }, bytes: new Uint8Array([1, 2, 3]) } : null),
      readShelfPdf: async (id: string) => (id === 'p_1' ? { fileName: 'paper.pdf', bytes: new Uint8Array([4]) } : null),
    },
  } satisfies AgentContext;
  return { c, requests, saved };
}

describe('run_python', () => {
  it('puts the asked-for files in, runs, and keeps plots and downloads as chat files', async () => {
    const { c, requests, saved } = ctx({
      outputs: [
        { mime: 'image/png', data: Buffer.from('png').toString('base64') },
        { mime: 'text/plain', data: '42' },
      ],
      files: [{ path: 'out/results.csv', bytes: new TextEncoder().encode('x') }],
      missing: ['nope.csv'],
    });
    const r = await runTool(c, 'run_python', {
      code: 'import pandas as pd',
      inputs: [{ attachment: 'data.csv' }, { fileId: 'af_doc' }, { pdfId: 'p_1' }, { attachment: 'data.csv' }],
      downloads: ['out/results.csv', 'nope.csv'],
    });
    expect(r.label).toBe('Running Python');
    expect(requests[0].upload.map((f) => f.path)).toEqual(['data.csv', 'report.pdf', 'paper.pdf', 'data (2).csv']);
    expect(new TextDecoder().decode(requests[0].upload[0].bytes)).toBe('a,b\n1,2');
    expect(requests[0].timeoutMs).toBe(30_000);
    expect(saved.map((f) => [f.name, f.mime])).toEqual([
      ['plot 1', 'image/png'],
      ['results.csv', 'text/csv'],
    ]);
    expect(r.outcome).toMatchObject({
      status: 'done',
      output: {
        result: { stdout: 'mean 3.5\n', results: ['42'], savedFiles: [{ fileId: 'af_1' }, { fileId: 'af_2' }], notFound: ['nope.csv'] },
        display: { code: { language: 'python', source: 'import pandas as pd' }, files: [{ id: 'af_1' }, { id: 'af_2' }], summary: '2 files' },
      },
    });
  });

  it('shows the code’s error to the model and the user', async () => {
    const { c } = ctx({ error: { name: 'KeyError', message: "'x'", traceback: 'Traceback…' } });
    const r = await runTool(c, 'run_python', { code: 'd["x"]' });
    expect(r.outcome).toMatchObject({ status: 'done', output: { result: { error: { name: 'KeyError' } }, display: { code: { failed: true }, summary: 'Error: KeyError' } } });
  });

  it('refuses files that aren’t the user’s, and says when the sandbox isn’t set up', async () => {
    expect((await runTool(ctx().c, 'run_python', { code: 'x', inputs: [{ pdfId: 'p_other' }] })).outcome).toMatchObject({ status: 'error', message: expect.stringContaining('p_other') });
    expect((await runTool(ctx().c, 'run_python', { code: 'x', inputs: [{ pdfId: 'p_1', fileId: 'af_doc' }] })).outcome).toMatchObject({ status: 'error' });
    expect((await runTool(ctx({}, { code: false }).c, 'run_python', { code: 'x' })).outcome).toMatchObject({ status: 'error', message: 'Running code isn’t set up yet.' });
    expect((await runTool(ctx().c, 'run_python', { code: 'x', timeoutSeconds: 120 })).outcome).toMatchObject({ status: 'error' });
  });

  it('knows common file types', () => {
    expect(mimeFor('a.CSV')).toBe('text/csv');
    expect(mimeFor('x.xlsx')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(mimeFor('blob')).toBe('application/octet-stream');
  });
});

describe.skipIf(!TEST_DB_URL)('the chat’s sandbox session (Postgres)', () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await openTestDb();
  });
  afterAll(async () => {
    await t?.close();
  });

  it('remembers the session on the conversation and passes it to the next run', async () => {
    const user = await t.addUser();
    const c = await createConversation(t.pool, user, 'Data', 'm');
    const sessions: (string | null)[] = [];
    const sandbox: CodeSandbox = { name: 'fake', run: vi.fn(async (r: CodeRequest) => (sessions.push(r.sessionId), run({ sessionId: r.sessionId ?? 'sb_A' }))), close: vi.fn() };
    const runner = codeRunner(sandbox, t.pool, { userId: user, conversationId: c.id });
    expect((await runner.run({ code: 'a = 1', upload: [], download: [], timeoutMs: 1000 })).newSession).toBe(true);
    expect(await getSandboxId(t.pool, user, c.id)).toBe('sb_A');
    expect((await runner.run({ code: 'a', upload: [], download: [], timeoutMs: 1000 })).newSession).toBe(false);
    expect(sessions).toEqual([null, 'sb_A']);
  });
});
