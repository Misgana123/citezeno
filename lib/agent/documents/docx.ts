import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from 'docx';
import { fitPicture, spans, type DocBlock, type Picture } from './blocks';

/* A Word document from the assistant's blocks (the docx library, on the
   server). Pictures come already loaded, by file ID. */

export type LoadedPicture = Picture & { bytes: Uint8Array };
export type DocxInput = { title?: string; author?: string; blocks: DocBlock[]; pictures: Map<string, LoadedPicture> };

/* A4 with 2.54 cm margins leaves about 6.27 inches, 600 pixels at 96 per inch. */
const CONTENT_PX = 600;
const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];

function runs(text: string): ParagraphChild[] {
  return spans(text).map((s) => {
    const run = new TextRun({ text: s.text, bold: s.bold, italics: s.italic, ...(s.link ? { style: 'Hyperlink' } : {}) });
    return s.link ? new ExternalHyperlink({ link: s.link, children: [run] }) : run;
  });
}

const cell = (text: string, header: boolean) =>
  new TableCell({
    children: [new Paragraph({ children: header ? [new TextRun({ text, bold: true })] : runs(text) })],
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    ...(header ? { shading: { fill: 'EEF1F5' } } : {}),
  });

function blockParts(b: DocBlock, pictures: DocxInput['pictures'], list: { n: number }): (Paragraph | Table)[] {
  switch (b.type) {
    case 'heading':
      return [new Paragraph({ heading: HEADINGS[(b.level ?? 1) - 1], children: runs(b.text) })];
    case 'paragraph':
      return b.text.split(/\n{2,}/).map((t) => new Paragraph({ children: runs(t), spacing: { after: 160 } }));
    case 'quote':
      return [new Paragraph({ children: runs(b.text), indent: { left: 567 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'B8C2D0', space: 8 } }, spacing: { after: 160 } })];
    case 'bullets':
      return b.items.map((t) => new Paragraph({ children: runs(t), bullet: { level: 0 } }));
    case 'numbered': {
      // each numbered list starts again at 1
      const instance = ++list.n;
      return b.items.map((t) => new Paragraph({ children: runs(t), numbering: { reference: 'numbers', level: 0, instance } }));
    }
    case 'table': {
      const cols = Math.max(b.headers.length, ...b.rows.map((r) => r.length));
      const pad = (r: string[]) => [...r, ...Array(cols - r.length).fill('')];
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [new TableRow({ tableHeader: true, children: pad(b.headers).map((h) => cell(h, true)) }), ...b.rows.map((r) => new TableRow({ children: pad(r).map((c) => cell(c, false)) }))],
        }),
        new Paragraph({ children: [] }),
      ];
    }
    case 'image': {
      const p = pictures.get(b.fileId);
      if (!p) return [];
      const size = fitPicture(p, CONTENT_PX, 1);
      const parts = [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new ImageRun({ type: p.type, data: p.bytes, transformation: size, altText: { name: b.caption ?? 'Picture', description: b.caption ?? '', title: b.caption ?? '' } })],
        }),
      ];
      if (b.caption) parts.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: b.caption, italics: true, size: 20 })], spacing: { after: 200 } }));
      return parts;
    }
    case 'references':
      return [
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(b.title || 'References')] }),
        ...b.items.map((t) => new Paragraph({ children: runs(t), indent: { left: 720, hanging: 720 }, spacing: { after: 120 } })),
      ];
    case 'page_break':
      return [new Paragraph({ children: [new PageBreak()] })];
  }
}

export async function buildDocx(input: DocxInput): Promise<Uint8Array> {
  const list = { n: 0 };
  const children: (Paragraph | Table)[] = [];
  if (input.title) children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(input.title)] }));
  if (input.author) children.push(new Paragraph({ children: [new TextRun({ text: input.author, color: '555555' })], spacing: { after: 240 } }));
  for (const b of input.blocks) children.push(...blockParts(b, input.pictures, list));

  const doc = new Document({
    creator: input.author || 'Citezeno',
    title: input.title,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    numbering: {
      config: [
        { reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      ],
    },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } }, children }],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}
