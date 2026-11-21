import { execFileSync } from 'node:child_process';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { AgentContext } from '@/lib/agent/context';
import { markdownBlocks } from '@/lib/agent/documents/markdown';
import { conversionCode } from '@/lib/agent/tools/convert';
import { runTool } from '@/lib/agent/tools/run';
import type { CodeRequest, CodeRun } from '@/lib/providers/code-sandbox/types';
import { shelfConfig } from '@/lib/shelf/config';

const hasPython = (() => {
  try {
    execFileSync('python3', ['--version']);
    return true;
  } catch {
    return false;
  }
})();

describe('Markdown as document blocks', () => {
  it('reads headings, lists, quotes, tables, breaks and paragraphs', () => {
    const md = '# Title\n\nFirst line\ncontinues **here**.\n\n## Part\n- a\n- b\n\n1. one\n2. two\n\n> quoted\n> more\n\n| A | B |\n|---|:-:|\n| 1 | 2 |\n\n---\nEnd';
    expect(markdownBlocks(md)).toEqual([
      { type: 'heading', text: 'Title', level: 1 },
      { type: 'paragraph', text: 'First line continues **here**.' },
      { type: 'heading', text: 'Part', level: 2 },
      { type: 'bullets', items: ['a', 'b'] },
      { type: 'numbered', items: ['one', 'two'] },
      { type: 'quote', text: 'quoted more' },
      { type: 'table', headers: ['A', 'B'], rows: [['1', '2']] },
      { type: 'page_break' },
      { type: 'paragraph', text: 'End' },
    ]);
  });
});

describe('the sandbox conversion', () => {
  it('passes settings as data, never as code', () => {
    const code = conversionCode({ src: 'convert/in/source.docx', out: "convert/out/x'); import os; os.system('rm -rf /'); ('", tool: 'soffice', filter: 'pdf', timeout: 35 });
    expect(code).not.toContain('os.system');
    expect(code).not.toContain("'); import");
  });

  it.skipIf(!hasPython)('is valid Python', () => {
    const code = conversionCode({ src: 'convert/in/source.docx', out: 'convert/out/source.pdf', tool: 'soffice', filter: 'pdf', timeout: 35 });
    expect(() => execFileSync('python3', ['-c', `import ast, sys; ast.parse(sys.stdin.read())`], { input: code })).not.toThrow();
  });
});

describe('convert_file', () => {
  function ctx(sandbox?: (r: Omit<CodeRequest, 'sessionId'>) => Partial<CodeRun>) {
    const saved: { name: string; mime: string; bytes: Uint8Array }[] = [];
    const requests: Omit<CodeRequest, 'sessionId'>[] = [];
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
      chatAttachments: async () => [
        { kind: 'text' as const, name: 'notes.md', text: '# Notes\n\n- one' },
        { kind: 'text' as const, name: 'essay.docx', text: 'Essay text' },
      ],
      code: () =>
        sandbox
          ? {
              run: async (r: Omit<CodeRequest, 'sessionId'>) => (
                requests.push(r),
                { sessionId: 's', stdout: '', stderr: '', error: null, outputs: [], files: [], missing: [], newSession: false, ...sandbox(r) }
              ),
            }
          : null,
      files: {
        save: async (f: { name: string; mime: string; bytes: Uint8Array }) => (saved.push(f), { id: 'af_new', name: f.name, mime: f.mime, size: f.bytes.byteLength }),
        read: async (id: string) => (id === 'af_deck' ? { file: { id, name: 'Talk.pptx', mime: 'x', size: 1 }, bytes: new Uint8Array([1]) } : null),
        readShelfPdf: async () => null,
      },
    } satisfies AgentContext;
    return { c, saved, requests };
  }

  it('turns attached Markdown into a Word file on our server', async () => {
    const { c, saved, requests } = ctx();
    const r = await runTool(c, 'convert_file', { attachment: 'notes.md', to: 'docx' });
    expect(r.outcome).toMatchObject({ status: 'done', output: { result: { fileName: 'notes.docx' }, display: { summary: 'DOCX ready' } } });
    expect(requests).toHaveLength(0);
    const xml = await (await JSZip.loadAsync(saved[0].bytes)).file('word/document.xml')!.async('string');
    expect(xml).toContain('Notes');
  });

  it('converts slides to PDF in the sandbox, on fixed paths', async () => {
    const { c, saved, requests } = ctx(() => ({ stdout: 'exit 0', files: [{ path: 'convert/out/source.pdf', bytes: new Uint8Array([37, 80, 68, 70]) }] }));
    const r = await runTool(c, 'convert_file', { fileId: 'af_deck', to: 'pdf' });
    expect(r.outcome).toMatchObject({ status: 'done', output: { result: { fileName: 'Talk.pdf' } } });
    expect(requests[0].upload.map((f) => f.path)).toEqual(['convert/in/source.pptx']);
    expect(requests[0].download).toEqual(['convert/out/source.pdf']);
    expect(saved[0].mime).toBe('application/pdf');
  });

  it('says what can’t be done', async () => {
    const missing = ctx(() => ({ stdout: 'CITEZENO_MISSING_TOOL' })).c;
    expect((await runTool(missing, 'convert_file', { fileId: 'af_deck', to: 'pdf' })).outcome).toMatchObject({ status: 'error', message: expect.stringContaining('LibreOffice') });
    const none = ctx().c;
    expect((await runTool(none, 'convert_file', { fileId: 'af_deck', to: 'pdf' })).outcome).toMatchObject({ status: 'error', message: 'Converting this kind of file isn’t set up yet.' });
    expect((await runTool(none, 'convert_file', { fileId: 'af_deck', to: 'csv' })).outcome).toMatchObject({ status: 'error', message: expect.stringContaining('can become PDF, PPTX') });
    expect((await runTool(none, 'convert_file', { pdfId: 'p_1', to: 'docx' })).outcome).toMatchObject({ status: 'error', message: expect.stringContaining('PDFs can’t be converted') });
    // an attached Word file arrived as text: it converts as text, and says so
    const ok = await runTool(none, 'convert_file', { attachment: 'essay.docx', to: 'pdf' });
    expect(ok.outcome).toMatchObject({ status: 'done', output: { result: { note: expect.stringContaining('text') } } });
  });
});
