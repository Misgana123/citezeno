import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { AgentContext } from '@/lib/agent/context';
import { agentFileName } from '@/lib/agent/files';
import { runTool } from '@/lib/agent/tools/run';
import { shelfConfig } from '@/lib/shelf/config';

function ctx(zipBytes?: Uint8Array) {
  const saved: { name: string; mime: string; bytes: Uint8Array }[] = [];
  const c: AgentContext = {
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
      { kind: 'text', name: 'notes.md', text: '# Notes' },
      { kind: 'text', name: 'paper.pdf', text: 'The text the browser read' },
      { kind: 'image', name: 'fig.png', mediaType: 'image/png', data: Buffer.from('png!').toString('base64') },
    ],
    code: () => null,
    files: {
      save: async (f) => (saved.push(f), { id: `af_${saved.length}`, name: agentFileName(f.name, f.mime), mime: f.mime, size: f.bytes.byteLength }),
      read: async (id) =>
        id === 'af_doc'
          ? { file: { id, name: 'report.docx', mime: 'application/msword', size: 3 }, bytes: new Uint8Array([1, 2, 3]) }
          : id === 'af_in' && zipBytes
            ? { file: { id, name: 'data.zip', mime: 'application/zip', size: zipBytes.byteLength }, bytes: zipBytes }
            : null,
      readShelfPdf: async (id) => (id === 'p_1' ? { fileName: 'report.docx', bytes: new Uint8Array([4]) } : null),
    },
  };
  return { c, saved };
}

describe('zip_files', () => {
  it('zips chat files, shelf PDFs and attachments, keeping names unique', async () => {
    const { c, saved } = ctx();
    const r = await runTool(c, 'zip_files', { files: [{ fileId: 'af_doc' }, { pdfId: 'p_1' }, { attachment: 'notes.md' }, { attachment: 'paper.pdf' }, { attachment: 'fig.png' }], filename: 'Thesis files' });
    expect(r.outcome).toMatchObject({ status: 'done', output: { result: { fileName: 'Thesis files.zip', files: ['report.docx', 'report (2).docx', 'notes.md', 'paper.txt', 'fig.png'] }, display: { summary: '5 files' } } });
    expect(saved[0].mime).toBe('application/zip');
    const zip = await JSZip.loadAsync(saved[0].bytes);
    expect(Object.keys(zip.files)).toHaveLength(5);
    expect(await zip.file('paper.txt')!.async('string')).toBe('The text the browser read');
    expect(await zip.file('fig.png')!.async('string')).toBe('png!');
  });

  it('says which file it couldn’t find', async () => {
    expect((await runTool(ctx().c, 'zip_files', { files: [{ fileId: 'nope' }], filename: 'x' })).outcome).toMatchObject({ status: 'error', message: expect.stringContaining('nope') });
  });
});

async function zipOf(files: Record<string, string | Uint8Array>): Promise<Uint8Array> {
  const z = new JSZip();
  for (const [name, data] of Object.entries(files)) z.file(name, data);
  return z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

describe('unzip_file', () => {
  it('keeps every file of a ZIP as a chat file, flattening folders and skipping Mac clutter', async () => {
    const { c, saved } = ctx(await zipOf({ 'data/a.csv': 'x,y\n1,2', 'b/a.csv': 'z', 'README.md': '# hi', '__MACOSX/._a.csv': 'junk', 'data/.DS_Store': 'junk' }));
    const r = await runTool(c, 'unzip_file', { fileId: 'af_in' });
    expect(r.outcome).toMatchObject({
      status: 'done',
      output: {
        result: { files: [{ fileId: 'af_1', fileName: 'a.csv', path: 'data/a.csv' }, { fileName: 'a (2).csv', path: 'b/a.csv' }, { fileName: 'README.md' }] },
        display: { files: [{ id: 'af_1' }, { id: 'af_2' }, { id: 'af_3' }], summary: '3 files' },
      },
    });
    expect(saved.map((f) => f.mime)).toEqual(['text/csv', 'text/csv', 'text/markdown']);
    expect(new TextDecoder().decode(saved[0].bytes)).toBe('x,y\n1,2');
  });

  it('opens only the files asked for, and says what the ZIP holds when none match', async () => {
    const bytes = await zipOf({ 'data/a.csv': '1', 'b.txt': '2' });
    const r = await runTool(ctx(bytes).c, 'unzip_file', { fileId: 'af_in', only: ['a.csv'] });
    expect(r.outcome).toMatchObject({ output: { result: { files: [{ path: 'data/a.csv' }], leftInZip: 1 } } });
    expect((await runTool(ctx(bytes).c, 'unzip_file', { fileId: 'af_in', only: ['zzz'] })).outcome).toMatchObject({ status: 'error', message: expect.stringContaining('data/a.csv, b.txt') });
  });

  it('refuses files that aren’t ZIPs, too many files, and ZIPs that unpack too large', async () => {
    const notZip = ctx(new TextEncoder().encode('hello'));
    expect((await runTool(notZip.c, 'unzip_file', { fileId: 'af_in' })).outcome).toMatchObject({ status: 'error', message: expect.stringContaining('isn’t a ZIP') });
    const many = ctx(await zipOf(Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`f${i}.txt`, 'x']))));
    expect((await runTool(many.c, 'unzip_file', { fileId: 'af_in' })).outcome).toMatchObject({ status: 'error', message: expect.stringContaining('51 files') });
    // about 101 MB of zeros squeezes into a tiny ZIP: refused before anything is unpacked
    const bomb = ctx(await zipOf({ 'zeros.bin': new Uint8Array(101 * 1024 * 1024) }));
    expect((await runTool(bomb.c, 'unzip_file', { fileId: 'af_in' })).outcome).toMatchObject({ status: 'error', message: expect.stringContaining('more than 100 MB') });
    expect(bomb.saved).toEqual([]);
  }, 30_000);
});
