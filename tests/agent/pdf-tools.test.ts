import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { AgentContext } from '@/lib/agent/context';
import { mergePdfs, parsePages, pickPages } from '@/lib/agent/documents/pdfs';
import { runTool } from '@/lib/agent/tools/run';
import { readPdfText } from '@/lib/providers/pdfjs/reader';
import { shelfConfig } from '@/lib/shelf/config';

/* A PDF whose pages say "<label> page n". */
async function pdf(label: string, pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let n = 1; n <= pages; n++) doc.addPage([300, 200]).drawText(`${label} page ${n}`, { x: 20, y: 100, size: 14, font });
  return doc.save();
}

describe('page ranges', () => {
  it('reads pages and ranges in order, without repeats', () => {
    expect(parsePages('1-3, 5', 9)).toEqual([1, 2, 3, 5]);
    expect(parsePages('8-', 9)).toEqual([8, 9]);
    expect(parsePages('3,1,3', 9)).toEqual([3, 1]);
  });

  it('says what is wrong with a range', () => {
    expect(() => parsePages('2-12', 9)).toThrow(/has 9 pages/);
    expect(() => parsePages('5-2', 9)).toThrow(/valid page range/);
    expect(() => parsePages('abc', 9)).toThrow(/isn’t a page/);
    expect(() => parsePages(' , ', 9)).toThrow(/Say which pages/);
  });
});

describe('merging and splitting', () => {
  it('merges PDFs in order and takes pages out', async () => {
    const merged = await mergePdfs(
      [
        { name: 'a', bytes: await pdf('A', 2) },
        { name: 'b', bytes: await pdf('B', 3) },
      ],
      'Both',
    );
    expect(merged.pageCount).toBe(5);
    const text = (await readPdfText(merged.bytes)).text;
    expect(text.indexOf('A page 2')).toBeLessThan(text.indexOf('B page 1'));

    const part = await pickPages({ name: 'm', bytes: merged.bytes }, '4-');
    expect(part).toMatchObject({ pageCount: 2, pages: [4, 5] });
    expect((await readPdfText(part.bytes)).text).toContain('B page 3');
  });

  it('refuses a file that isn’t a PDF', async () => {
    await expect(
      mergePdfs([
        { name: 'notes.pdf', bytes: new TextEncoder().encode('hello') },
        { name: 'b', bytes: await pdf('B', 1) },
      ]),
    ).rejects.toThrow(/"notes.pdf" couldn’t be read as a PDF/);
  });
});

describe('PDF tools', () => {
  async function ctx() {
    const saved: { name: string; mime: string; bytes: Uint8Array }[] = [];
    const shelf: Record<string, Uint8Array> = { p_1: await pdf('Shelf', 4) };
    const made: Record<string, Uint8Array> = { af_1: await pdf('Made', 1) };
    const c = {
      userId: 'u1',
      db: null as never,
      sources: () => null as never,
      papersConfig: { maxQueryChars: 1500, dailySearchesPerUser: 100 },
      shelfConfig: shelfConfig({}),
      reserveSearches: async () => {},
      webSearch: () => null,
      webFiles: () => null as never,
      pdfText: () => ({ name: 'pdfjs', read: readPdfText }),
      chatAttachments: async () => [], code: () => null,
      files: {
        save: async (f: { name: string; mime: string; bytes: Uint8Array }) => (saved.push(f), { id: 'af_new', name: f.name, mime: f.mime, size: f.bytes.byteLength }),
        read: async (id: string) => (made[id] ? { file: { id, name: 'made.pdf', mime: 'application/pdf', size: made[id].byteLength }, bytes: made[id] } : null),
        readShelfPdf: async (id: string) => (shelf[id] ? { fileName: 'paper.pdf', bytes: shelf[id] } : null),
      },
    } satisfies AgentContext;
    return { c, saved };
  }

  it('merges a shelf PDF with one made in the chat', async () => {
    const { c, saved } = await ctx();
    const r = await runTool(c, 'pdf_merge', { filename: 'bundle', inputs: [{ pdfId: 'p_1' }, { fileId: 'af_1' }] });
    expect(r.outcome).toMatchObject({ status: 'done', output: { result: { pages: 5, merged: ['paper.pdf', 'made.pdf'] }, display: { summary: '5 pages' } } });
    expect(saved[0].mime).toBe('application/pdf');
  });

  it('takes pages out, and reads some pages’ text', async () => {
    const { c } = await ctx();
    expect((await runTool(c, 'pdf_split', { filename: 'part', pdf: { pdfId: 'p_1' }, pages: '2-3' })).outcome).toMatchObject({ status: 'done', output: { result: { pages: 2 } } });
    const read = await runTool(c, 'pdf_extract_text', { pdf: { pdfId: 'p_1' }, pages: '3' });
    const out = (read.outcome as { output: { result: { text: string; pageCount: number } } }).output.result;
    expect(out.pageCount).toBe(4);
    expect(out.text).toContain('Shelf page 3');
    expect(out.text).not.toContain('Shelf page 1');
  });

  it('refuses PDFs that aren’t the user’s, and bad page ranges', async () => {
    const { c, saved } = await ctx();
    expect((await runTool(c, 'pdf_split', { filename: 'x', pdf: { pdfId: 'p_other' }, pages: '1' })).outcome).toMatchObject({
      status: 'error',
      message: expect.stringContaining('no PDF with pdfId "p_other"'),
    });
    expect((await runTool(c, 'pdf_split', { filename: 'x', pdf: { pdfId: 'p_1' }, pages: '9' })).outcome).toMatchObject({ status: 'error', message: expect.stringContaining('has 4 pages') });
    expect((await runTool(c, 'pdf_split', { filename: 'x', pdf: { pdfId: 'p_1', fileId: 'af_1' }, pages: '1' })).outcome).toMatchObject({ status: 'error' });
    expect(saved).toHaveLength(0);
  });
});
