import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { AgentContext } from '@/lib/agent/context';
import { pictureInfo } from '@/lib/agent/documents/blocks';
import { workbookProblems, type Sheet } from '@/lib/agent/documents/sheets';
import { buildPptx, slideProblems, type Slide } from '@/lib/agent/documents/slides';
import { buildXlsx } from '@/lib/agent/documents/sheets';
import { runTool } from '@/lib/agent/tools/run';
import { shelfConfig } from '@/lib/shelf/config';

const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAEElEQVR4nGP4z8DAwMDAAAAJ/AH/Vu0JOwAAAABJRU5ErkJggg==', 'base64'));
const pictures = new Map([['af_chart', { ...pictureInfo(PNG)!, bytes: PNG }]]);

const SLIDES: Slide[] = [
  { title: 'Sleep and memory', subtitle: 'A short review' },
  { title: 'Findings', bullets: ['Sleep **helps** recall', 'See [the review](https://doi.org/10.1/x)'], notes: 'Say this slowly.' },
  { title: 'Studies', table: { headers: ['Study', 'N'], rows: [['Walker 2017', '120']] } },
  { title: 'Papers per year', chart: { kind: 'bar', categories: ['2021', '2022'], series: [{ name: 'Saved', values: [3, 7] }] }, bullets: ['Growing'] },
  { title: 'Figure', image: { fileId: 'af_chart', caption: 'Figure 1' } },
];

describe('slides', () => {
  it('checks each slide', () => {
    expect(slideProblems(SLIDES)).toBeNull();
    expect(slideProblems([{ title: 'x', bullets: ['a'], table: { headers: ['h'], rows: [] }, image: { fileId: 'f' } }])).toMatch(/too much/);
    expect(slideProblems([{}])).toMatch(/empty/);
    expect(slideProblems([{ chart: { kind: 'bar', categories: ['a', 'b'], series: [{ name: 's', values: [1] }] } }])).toMatch(/one chart value per category/);
  });

  it('makes a deck with text, a table, a native chart, a picture and notes', async () => {
    const zip = await JSZip.loadAsync(await buildPptx({ title: 'Deck', slides: SLIDES, pictures }));
    const names = Object.keys(zip.files);
    expect(names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))).toHaveLength(5);
    const all = (await Promise.all(names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).map((n) => zip.file(n)!.async('string')))).join('');
    for (const t of ['Sleep and memory', 'A short review', 'helps', 'Walker 2017', 'Figure 1']) expect(all).toContain(t);
    expect(names.some((n) => n.startsWith('ppt/charts/chart'))).toBe(true);
    expect(names.some((n) => n.startsWith('ppt/media/'))).toBe(true);
    expect(names.some((n) => n.startsWith('ppt/notesSlides/'))).toBe(true);
  });
});

describe('spreadsheets', () => {
  const SHEETS: Sheet[] = [
    {
      name: 'Papers',
      headers: ['Title', 'Year', 'Citations', 'Saved', 'Note'],
      rows: [
        ['Deep learning', 2015, 70000, { date: '2024-05-01' }, '=cmd|stays text'],
        ['Attention', 2017, 90000, { date: '2024-06-02' }, null],
        ['Total', null, { formula: 'SUM(C2:C3)' }, null, true],
      ],
      numberFormat: '#,##0',
      images: [{ fileId: 'af_chart', cell: 'H2' }],
    },
    { name: 'Notes', rows: [['Plain sheet']] },
  ];

  it('refuses unsafe formulas, repeated names and huge sheets', () => {
    expect(workbookProblems(SHEETS)).toBeNull();
    for (const f of ['WEBSERVICE("http://x")', "cmd|' /c calc'!A0", '[other.xlsx]Sheet1!A1', 'HYPERLINK("http://x")', 'IMPORTDATA("https://x")']) {
      expect(workbookProblems([{ name: 'S', rows: [[{ formula: f }]] }]), f).toMatch(/isn’t allowed/);
    }
    expect(
      workbookProblems([
        { name: 'A', rows: [] },
        { name: 'a', rows: [] },
      ]),
    ).toMatch(/Two sheets/);
  });

  it('keeps numbers, dates and formulas, keeps "=" text as text, freezes and filters the header', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await buildXlsx({ sheets: SHEETS, pictures })) as never);
    const ws = wb.getWorksheet('Papers')!;
    expect(ws.getCell('B2').value).toBe(2015);
    expect(ws.getCell('C2').numFmt).toBe('#,##0');
    expect(ws.getCell('D2').value).toEqual(new Date('2024-05-01T00:00:00Z'));
    expect(ws.getCell('C4').value).toMatchObject({ formula: 'SUM(C2:C3)' });
    expect(JSON.stringify(ws.getCell('E2').value)).toContain('=cmd|stays text');
    expect(ws.getCell('E2').type).not.toBe(ExcelJS.ValueType.Formula);
    expect(ws.getCell('A1').font?.bold).toBe(true);
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(ws.autoFilter).toBeTruthy();
    expect(ws.getImages()).toHaveLength(1);
    expect(wb.getWorksheet('Notes')!.getCell('A1').value).toBe('Plain sheet');
  });
});

describe('slide and spreadsheet tools', () => {
  const ctx = () => {
    const saved: { mime: string }[] = [];
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
      chatImages: async () => [],
      files: {
        save: async (f: { name: string; mime: string; bytes: Uint8Array }) => (saved.push(f), { id: 'af_new', name: f.name, mime: f.mime, size: f.bytes.byteLength }),
        read: async (id: string) => (id === 'af_chart' ? { file: { id, name: 'c.png', mime: 'image/png', size: PNG.byteLength }, bytes: PNG } : null),
        readShelfPdf: async () => null,
      },
    } satisfies AgentContext;
    return { c, saved };
  };

  it('makes slides and a spreadsheet', async () => {
    const { c, saved } = ctx();
    expect((await runTool(c, 'create_pptx', { filename: 'deck', slides: SLIDES })).outcome).toMatchObject({ status: 'done', output: { display: { summary: '5 slides' } } });
    expect((await runTool(c, 'create_xlsx', { filename: 'papers', sheets: [{ name: 'Papers', headers: ['A'], rows: [[1], [2]] }] })).outcome).toMatchObject({
      status: 'done',
      output: { display: { summary: '1 sheet, 2 rows' } },
    });
    expect(saved.map((s) => s.mime)).toEqual(['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
  });

  it('says what is wrong instead of making a broken file', async () => {
    const { c, saved } = ctx();
    const r = await runTool(c, 'create_xlsx', { filename: 'x', sheets: [{ name: 'S', rows: [[{ formula: 'WEBSERVICE("http://evil")' }]] }] });
    expect(r.outcome).toMatchObject({ status: 'error', message: expect.stringContaining('isn’t allowed') });
    expect(saved).toHaveLength(0);
  });
});
