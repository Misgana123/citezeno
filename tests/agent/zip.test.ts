import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { AgentContext } from '@/lib/agent/context';
import { agentFileName } from '@/lib/agent/files';
import { runTool } from '@/lib/agent/tools/run';
import { shelfConfig } from '@/lib/shelf/config';

function ctx() {
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
      save: async (f) => (saved.push(f), { id: 'af_zip', name: agentFileName(f.name, f.mime), mime: f.mime, size: f.bytes.byteLength }),
      read: async (id) => (id === 'af_doc' ? { file: { id, name: 'report.docx', mime: 'application/msword', size: 3 }, bytes: new Uint8Array([1, 2, 3]) } : null),
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
