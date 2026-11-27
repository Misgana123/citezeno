import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import type { AgentContext } from '@/lib/agent/context';
import { blockSchema, fitPicture, pictureInfo, spans, type DocBlock } from '@/lib/agent/documents/blocks';
import { buildDocx } from '@/lib/agent/documents/docx';
import { buildPdf } from '@/lib/agent/documents/pdf';
import { runTool } from '@/lib/agent/tools/run';
import { readPdfText } from '@/lib/providers/pdfjs/reader';
import { shelfConfig } from '@/lib/shelf/config';

/* A 2×1 PNG (red, blue). */
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAEElEQVR4nGP4z8DAwMDAAAAJ/AH/Vu0JOwAAAABJRU5ErkJggg==', 'base64'));

const BLOCKS: DocBlock[] = [
  { type: 'heading', text: 'Sleep and memory' },
  { type: 'paragraph', text: 'Sleep **helps** memory, see [the review](https://doi.org/10.1/x).' },
  { type: 'heading', text: 'Findings', level: 2 },
  { type: 'bullets', items: ['First finding', 'Second finding'] },
  { type: 'numbered', items: ['Step one', 'Step two'] },
  { type: 'quote', text: 'A quoted line.' },
  { type: 'table', headers: ['Study', 'N'], rows: [['Walker 2017', '120'], ['Lee']] },
  { type: 'image', fileId: 'af_chart', caption: 'Figure 1' },
  { type: 'page_break' },
  { type: 'references', items: ['Walker, M. (2017). *Why we sleep*. Scribner.'] },
];
const pictures = new Map([['af_chart', { ...pictureInfo(PNG)!, bytes: PNG }]]);

describe('document blocks', () => {
  it('reads bold, italic and links, and leaves other marks as text', () => {
    expect(spans('a **b** *c* _d_ [e](https://x.org/y) f')).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' ' },
      { text: 'c', italic: true },
      { text: ' ' },
      { text: 'd', italic: true },
      { text: ' ' },
      { text: 'e', link: 'https://x.org/y' },
      { text: ' f' },
    ]);
    expect(spans('**bold *both***')).toEqual([
      { text: 'bold ', bold: true },
      { text: 'both', bold: true, italic: true },
    ]);
    expect(spans('2 * 3 = 6, snake_case_name, [x](javascript:alert(1)), **open')).toEqual([{ text: '2 * 3 = 6, snake_case_name, [x](javascript:alert(1)), **open' }]);
  });

  it('knows a picture’s type and size, and fits it to the page', () => {
    expect(pictureInfo(PNG)).toEqual({ type: 'png', width: 2, height: 1 });
    expect(pictureInfo(new TextEncoder().encode('<svg/>'))).toBeNull();
    expect(fitPicture({ type: 'png', width: 1200, height: 600 }, 600, 1)).toEqual({ width: 600, height: 300 });
    expect(fitPicture({ type: 'png', width: 400, height: 200 }, 451, 0.75)).toEqual({ width: 300, height: 150 });
  });

  it('accepts only the known blocks', () => {
    expect(blockSchema.safeParse({ type: 'heading', text: 'x', level: 4 }).success).toBe(false);
    expect(blockSchema.safeParse({ type: 'script', text: 'x' }).success).toBe(false);
    expect(blockSchema.safeParse({ type: 'table', headers: ['a'], rows: [['1', '2']] }).success).toBe(true);
  });
});

describe('building documents', () => {
  it('makes a Word file with every block', async () => {
    const bytes = await buildDocx({ title: 'Report', author: 'Ada', blocks: BLOCKS, pictures });
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file('word/document.xml')!.async('string');
    for (const t of ['Report', 'Sleep and memory', 'helps', 'First finding', 'Step two', 'Walker 2017', 'Figure 1', 'References', 'Why we sleep']) expect(xml).toContain(t);
    expect(xml).toContain('<w:b/>');
    expect(Object.keys(zip.files).some((f) => f.startsWith('word/media/'))).toBe(true);
    expect(await zip.file('word/_rels/document.xml.rels')!.async('string')).toContain('https://doi.org/10.1/x');
  });

  it('makes a PDF with every block, without reaching outside', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const bytes = await buildPdf({ title: 'Report', blocks: BLOCKS, pictures });
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
    const { text, pageCount } = await readPdfText(bytes);
    expect(pageCount).toBe(2);
    for (const t of ['Report', 'Sleep and memory', 'First finding', 'Walker 2017', 'Figure 1', 'Why we sleep']) expect(text).toContain(t);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('document tools', () => {
  function ctx(files: Record<string, Uint8Array> = { af_chart: PNG }) {
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
      chatAttachments: async () => [], code: () => null,
      files: {
        save: async (f: { name: string; mime: string; bytes: Uint8Array }) => (saved.push(f), { id: 'af_new', name: `${f.name}.x`, mime: f.mime, size: f.bytes.byteLength }),
        read: async (id: string) => (files[id] ? { file: { id, name: 'chart.png', mime: 'image/png', size: files[id].byteLength }, bytes: files[id] } : null),
        readShelfPdf: async () => null,
      },
    } satisfies AgentContext;
    return { c, saved };
  }

  it('saves a Word file and offers it for download', async () => {
    const { c, saved } = ctx();
    const r = await runTool(c, 'create_docx', { filename: 'Sleep review', title: 'Sleep review', blocks: BLOCKS });
    expect(r.label).toBe('Making a Word document “Sleep review”');
    expect(r.outcome).toMatchObject({ status: 'done', output: { result: { fileId: 'af_new' }, display: { file: { id: 'af_new' }, summary: 'Word document ready' } } });
    expect(saved[0]).toMatchObject({ name: 'Sleep review', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  });

  it('saves a PDF', async () => {
    const { c, saved } = ctx();
    const r = await runTool(c, 'create_pdf', { filename: 'handout', blocks: [{ type: 'paragraph', text: 'Hello' }] });
    expect(r.outcome).toMatchObject({ status: 'done', output: { display: { summary: 'PDF ready' } } });
    expect(saved[0].mime).toBe('application/pdf');
  });

  it('refuses a picture that isn’t one of this chat’s pictures', async () => {
    const { c, saved } = ctx({});
    const r = await runTool(c, 'create_pdf', { filename: 'x', blocks: [{ type: 'image', fileId: 'af_someone_else' }] });
    expect(r.outcome).toMatchObject({ status: 'error', message: expect.stringContaining('no picture with fileId "af_someone_else"') });
    expect(saved).toHaveLength(0);
  });
});
