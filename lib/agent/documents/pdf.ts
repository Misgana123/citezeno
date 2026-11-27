import { fitPicture, spans, type DocBlock } from './blocks';
import type { LoadedPicture } from './docx';
import { robotoFonts } from './fonts';

/* A PDF from the assistant's blocks (pdfmake, on the server), set in Roboto,
   which pdfmake ships: Latin, Greek and Cyrillic text. pdfmake is told never
   to read local files or fetch web addresses: fonts come from its own file
   set and pictures are handed over in memory. */

export type PdfInput = { title?: string; author?: string; blocks: DocBlock[]; pictures: Map<string, LoadedPicture> };

/* A4 (595 × 842 pt) with 2.54 cm margins. */
const MARGIN = 72;
const CONTENT_PT = 595 - 2 * MARGIN;
const LINK = '#1a56db';

type PdfMake = {
  virtualfs: { writeFileSync(name: string, content: Buffer): void };
  setFonts(fonts: unknown): void;
  setUrlAccessPolicy(fn: (url: string) => boolean): void;
  setLocalAccessPolicy(fn: (path: string) => boolean): void;
  createPdf(doc: unknown): { getBuffer(): Promise<Buffer> };
};

let ready: Promise<PdfMake> | null = null;

/* pdfmake, loaded once, with its Roboto fonts in its in-memory file set and every outside access refused. */
function pdfmake(): Promise<PdfMake> {
  return (ready ??= (async () => {
    const pm = ((await import('pdfmake')) as unknown as { default?: PdfMake }).default ?? ((await import('pdfmake')) as unknown as PdfMake);
    for (const [name, bytes] of Object.entries(await robotoFonts())) pm.virtualfs.writeFileSync(name, bytes);
    pm.setFonts({ Roboto: { normal: 'Roboto-Regular.ttf', bold: 'Roboto-Medium.ttf', italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-MediumItalic.ttf' } });
    pm.setUrlAccessPolicy(() => false);
    pm.setLocalAccessPolicy(() => false);
    return pm;
  })());
}

const inline = (text: string) =>
  spans(text).map((s) => ({ text: s.text, ...(s.bold ? { bold: true } : {}), ...(s.italic ? { italics: true } : {}), ...(s.link ? { link: s.link, color: LINK, decoration: 'underline' } : {}) }));

function content(b: DocBlock, pictures: PdfInput['pictures']): unknown[] {
  switch (b.type) {
    case 'heading':
      return [{ text: inline(b.text), style: `h${b.level ?? 1}` }];
    case 'paragraph':
      return b.text.split(/\n{2,}/).map((t) => ({ text: inline(t), style: 'p' }));
    case 'quote':
      return [
        {
          table: {
            widths: [3, '*'],
            body: [
              [
                { text: '', fillColor: '#b8c2d0' },
                { text: inline(b.text), italics: true, margin: [8, 2, 0, 2] },
              ],
            ],
          },
          layout: 'noBorders',
          margin: [0, 0, 0, 10],
        },
      ];
    case 'bullets':
      return [{ ul: b.items.map((t) => ({ text: inline(t) })), style: 'list' }];
    case 'numbered':
      return [{ ol: b.items.map((t) => ({ text: inline(t) })), style: 'list' }];
    case 'table': {
      const cols = Math.max(b.headers.length, ...b.rows.map((r) => r.length));
      const pad = (r: string[]) => [...r, ...Array(cols - r.length).fill('')];
      return [
        {
          table: {
            headerRows: 1,
            widths: Array(cols).fill('*'),
            body: [pad(b.headers).map((h) => ({ text: h, bold: true, fillColor: '#eef1f5' })), ...b.rows.map((r) => pad(r).map((c) => ({ text: inline(c) })))],
          },
          layout: { hLineColor: () => '#d5dbe3', vLineColor: () => '#d5dbe3', paddingTop: () => 4, paddingBottom: () => 4 },
          fontSize: 9.5,
          margin: [0, 2, 0, 12],
        },
      ];
    }
    case 'image': {
      const p = pictures.get(b.fileId);
      if (!p) return [];
      const size = fitPicture(p, CONTENT_PT, 0.75);
      const src = `data:image/${p.type === 'jpg' ? 'jpeg' : 'png'};base64,${Buffer.from(p.bytes).toString('base64')}`;
      return [
        { image: src, ...size, alignment: 'center', margin: [0, 4, 0, b.caption ? 4 : 12] },
        ...(b.caption ? [{ text: b.caption, italics: true, fontSize: 9.5, alignment: 'center', margin: [0, 0, 0, 12] }] : []),
      ];
    }
    case 'references':
      return [{ text: b.title || 'References', style: 'h2' }, ...b.items.map((t) => ({ text: inline(t), style: 'ref' }))];
    case 'page_break':
      return [{ text: '', pageBreak: 'after' }];
  }
}

export async function buildPdf(input: PdfInput): Promise<Uint8Array> {
  const pm = await pdfmake();
  const head: unknown[] = [];
  if (input.title) head.push({ text: input.title, style: 'title' });
  if (input.author) head.push({ text: input.author, color: '#555555', margin: [0, 0, 0, 16] });
  const doc = {
    pageSize: 'A4',
    pageMargins: [MARGIN, MARGIN, MARGIN, MARGIN],
    info: { title: input.title ?? '', author: input.author ?? '', creator: 'Citezeno' },
    defaultStyle: { font: 'Roboto', fontSize: 11, lineHeight: 1.3 },
    styles: {
      title: { fontSize: 22, bold: true, margin: [0, 0, 0, 6] },
      h1: { fontSize: 17, bold: true, margin: [0, 14, 0, 6] },
      h2: { fontSize: 14, bold: true, margin: [0, 12, 0, 5] },
      h3: { fontSize: 12, bold: true, margin: [0, 10, 0, 4] },
      p: { margin: [0, 0, 0, 8] },
      list: { margin: [0, 0, 0, 10] },
      ref: { margin: [0, 0, 0, 6] },
    },
    footer: (page: number, pages: number) => (pages > 1 ? { text: `${page} / ${pages}`, alignment: 'center', fontSize: 8.5, color: '#888888', margin: [0, 20, 0, 0] } : null),
    content: [...head, ...input.blocks.flatMap((b) => content(b, input.pictures))],
  };
  return new Uint8Array(await pm.createPdf(doc).getBuffer());
}
