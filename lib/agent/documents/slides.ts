import { z } from 'zod';
import { fitPicture, spans } from './blocks';
import type { LoadedPicture } from './docx';

/* A PowerPoint deck (pptxgenjs, on the server). Each slide has a title and at
   most two of: bullets, a table, a picture made in this chat, or a native
   chart (editable in PowerPoint). Pictures come already loaded, by file ID;
   nothing is read from a path or a web address. */

const TEXT = z.string().max(2000);
const SLIDE_CHART_KINDS = ['bar', 'horizontal_bar', 'line', 'area', 'pie', 'doughnut'] as const;

export const slideSchema = z.object({
  title: z.string().max(200).optional(),
  subtitle: z.string().max(300).optional().describe('For a title slide (a slide with only a title and subtitle).'),
  bullets: z.array(TEXT).max(12).optional().describe('Short points; **bold**, *italic* and [links](https://…) work.'),
  table: z.object({ headers: z.array(z.string().max(200)).min(1).max(10), rows: z.array(z.array(z.string().max(500)).max(10)).max(20) }).optional(),
  image: z
    .object({ fileId: z.string().min(1).max(80), caption: z.string().max(200).optional() })
    .optional()
    .describe('A chart or picture made in this chat.'),
  chart: z
    .object({
      kind: z.enum(SLIDE_CHART_KINDS),
      categories: z.array(z.string().max(80)).min(1).max(50),
      series: z
        .array(z.object({ name: z.string().max(80), values: z.array(z.number().finite()).max(50) }))
        .min(1)
        .max(8),
      stacked: z.boolean().optional(),
      yLabel: z.string().max(80).optional(),
    })
    .optional()
    .describe('A native PowerPoint chart from numbers (one value per category in each series).'),
  notes: z.string().max(4000).optional().describe('Speaker notes.'),
});

export type Slide = z.infer<typeof slideSchema>;

export const deckInput = {
  filename: z.string().trim().min(1).max(120).describe('The file name, without the extension.'),
  title: z.string().max(300).optional().describe('The deck’s title, in the file’s properties.'),
  author: z.string().max(200).optional(),
  slides: z.array(slideSchema).min(1).max(60),
};

export function slideProblems(slides: Slide[]): string | null {
  for (const [i, s] of slides.entries()) {
    const parts = [s.bullets?.length, s.table, s.image, s.chart].filter(Boolean).length;
    if (parts > 2) return `Slide ${i + 1} has too much on it: use at most two of bullets, table, image and chart.`;
    if (!parts && !s.title && !s.subtitle) return `Slide ${i + 1} is empty.`;
    if (s.chart && s.chart.series.some((x) => x.values.length !== s.chart!.categories.length)) return `Slide ${i + 1}: give one chart value per category.`;
  }
  return null;
}

/* 16:9, in inches. */
const W = 13.333;
const H = 7.5;
const PAD = 0.6;
const BODY_Y = 1.45;
const BODY_H = H - BODY_Y - 0.5;
const INK = '111827';
const MUTED = '4B5563';
const ACCENT = '2563EB';
const COLORS = ['2563EB', 'F59E0B', '10B981', 'EF4444', '8B5CF6', '06B6D4', 'EC4899', '84CC16'];

type Box = { x: number; y: number; w: number; h: number };
type PptxSlide = {
  addText(text: unknown, opts: Record<string, unknown>): void;
  addTable(rows: unknown[], opts: Record<string, unknown>): void;
  addImage(opts: Record<string, unknown>): void;
  addChart(type: unknown, data: unknown[], opts: Record<string, unknown>): void;
  addNotes(text: string): void;
  background?: unknown;
};

const runs = (text: string, size: number) =>
  spans(text).map((s) => ({ text: s.text, options: { bold: s.bold, italic: s.italic, fontSize: size, ...(s.link ? { hyperlink: { url: s.link }, color: ACCENT } : {}) } }));

function addBullets(slide: PptxSlide, items: string[], box: Box) {
  const size = items.length > 7 ? 16 : 20;
  const paras = items.map((t) => runs(t, size).map((r, i) => (i === 0 ? { ...r, options: { ...r.options, bullet: { indent: 18 }, paraSpaceAfter: 8, breakLine: false } } : r)));
  const text = paras.flatMap((p, i) => (i < paras.length - 1 ? [...p.slice(0, -1), { ...p.at(-1)!, options: { ...p.at(-1)!.options, breakLine: true } }] : p));
  slide.addText(text, { ...box, valign: 'top', color: INK, fontFace: 'Calibri', fit: 'shrink' });
}

function addTable(slide: PptxSlide, t: NonNullable<Slide['table']>, box: Box) {
  const cols = Math.max(t.headers.length, ...t.rows.map((r) => r.length));
  const pad = (r: string[]) => [...r, ...Array(cols - r.length).fill('')];
  const size = t.rows.length > 10 ? 11 : 13;
  const rows = [pad(t.headers).map((h) => ({ text: h, options: { bold: true, fill: { color: 'EEF1F5' }, color: INK } })), ...t.rows.map((r) => pad(r).map((c) => ({ text: c })))];
  slide.addTable(rows, {
    x: box.x,
    y: box.y,
    w: box.w,
    colW: Array(cols).fill(box.w / cols),
    fontSize: size,
    fontFace: 'Calibri',
    color: INK,
    border: { type: 'solid', pt: 0.75, color: 'D5DBE3' },
    autoPage: false,
  });
}

function addPicture(slide: PptxSlide, p: LoadedPicture, caption: string | undefined, box: Box) {
  const room = { w: box.w, h: caption ? box.h - 0.4 : box.h };
  // fit inside the box, keeping the shape (inches at 96 pixels per inch)
  const byWidth = fitPicture(p, room.w * 96, 1);
  const scale = Math.min(1, (room.h * 96) / byWidth.height);
  const w = (byWidth.width * scale) / 96;
  const h = (byWidth.height * scale) / 96;
  const data = `${p.type === 'jpg' ? 'image/jpeg' : 'image/png'};base64,${Buffer.from(p.bytes).toString('base64')}`;
  slide.addImage({ data, x: box.x + (box.w - w) / 2, y: box.y, w, h });
  if (caption) slide.addText(caption, { x: box.x, y: box.y + h + 0.05, w: box.w, h: 0.35, fontSize: 12, italic: true, color: MUTED, align: 'center', fontFace: 'Calibri' });
}

function addChart(pptx: { ChartType: Record<string, unknown> }, slide: PptxSlide, c: NonNullable<Slide['chart']>, box: Box) {
  const type = { bar: 'bar', horizontal_bar: 'bar', line: 'line', area: 'area', pie: 'pie', doughnut: 'doughnut' }[c.kind];
  const data = c.series.map((s) => ({ name: s.name, labels: c.categories, values: s.values }));
  const round = c.kind === 'pie' || c.kind === 'doughnut';
  slide.addChart(pptx.ChartType[type], round ? data.slice(0, 1) : data, {
    ...box,
    barDir: c.kind === 'horizontal_bar' ? 'bar' : 'col',
    barGrouping: c.stacked ? 'stacked' : 'clustered',
    chartColors: COLORS,
    showLegend: round || c.series.length > 1,
    legendPos: 'b',
    legendFontSize: 12,
    catAxisLabelFontSize: 12,
    valAxisLabelFontSize: 12,
    ...(c.yLabel && !round ? { showValAxisTitle: true, valAxisTitle: c.yLabel, valAxisTitleFontSize: 12 } : {}),
    ...(round ? { showPercent: true, dataLabelColor: 'FFFFFF' } : {}),
    lineSize: 2,
  });
}

export async function buildPptx(input: { title?: string; author?: string; slides: Slide[]; pictures: Map<string, LoadedPicture> }): Promise<Uint8Array> {
  const Pptx = ((await import('pptxgenjs')) as unknown as { default: new () => unknown }).default;
  const pptx = new Pptx() as {
    layout: string;
    title: string;
    author: string;
    company: string;
    ChartType: Record<string, unknown>;
    addSlide(): PptxSlide;
    write(o: { outputType: 'nodebuffer' }): Promise<Buffer>;
  };
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = input.title ?? '';
  pptx.author = input.author ?? 'Citezeno';
  pptx.company = 'Citezeno';

  for (const s of input.slides) {
    const slide = pptx.addSlide();
    const parts = [s.bullets?.length ? 'bullets' : null, s.table ? 'table' : null, s.image ? 'image' : null, s.chart ? 'chart' : null].filter((x): x is string => !!x);
    if (!parts.length) {
      // a title slide
      slide.addText(s.title ?? '', { x: PAD, y: 2.4, w: W - 2 * PAD, h: 1.4, fontSize: 40, bold: true, color: INK, fontFace: 'Calibri', valign: 'bottom' });
      if (s.subtitle) slide.addText(s.subtitle, { x: PAD, y: 3.9, w: W - 2 * PAD, h: 1, fontSize: 22, color: MUTED, fontFace: 'Calibri', valign: 'top' });
      slide.addText('', { x: PAD, y: 3.85, w: 1.2, h: 0.06, fill: { color: ACCENT } });
    } else {
      if (s.title) slide.addText(s.title, { x: PAD, y: 0.4, w: W - 2 * PAD, h: 0.85, fontSize: 28, bold: true, color: INK, fontFace: 'Calibri', valign: 'middle', fit: 'shrink' });
      const full: Box = { x: PAD, y: BODY_Y, w: W - 2 * PAD, h: BODY_H };
      const half = (i: number): Box => ({ x: PAD + i * ((W - 2 * PAD) / 2 + 0.15), y: BODY_Y, w: (W - 2 * PAD) / 2 - 0.15, h: BODY_H });
      parts.forEach((part, i) => {
        const box = parts.length === 1 ? full : half(i);
        if (part === 'bullets') addBullets(slide, s.bullets!, box);
        else if (part === 'table') addTable(slide, s.table!, box);
        else if (part === 'chart') addChart(pptx, slide, s.chart!, box);
        else {
          const p = input.pictures.get(s.image!.fileId);
          if (p) addPicture(slide, p, s.image!.caption, box);
        }
      });
    }
    if (s.notes) slide.addNotes(s.notes);
  }
  return new Uint8Array(await pptx.write({ outputType: 'nodebuffer' }));
}
