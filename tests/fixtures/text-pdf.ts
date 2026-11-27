import { buildPdf } from '../shelf/pdf-fixtures';

/* A PDF with real text in a standard font (Helvetica), one entry per page:
   each line is drawn at (x, y) in points from the bottom-left, at its size.
   Used by the PDF.js provider and the reader's passage tests. */

export type Line = { text: string; x?: number; y: number; size?: number };

const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);

export function textPdf(pages: Line[][], opts: { title?: string; width?: number; height?: number } = {}): Uint8Array {
  const w = opts.width ?? 612;
  const h = opts.height ?? 792;
  const n = pages.length;
  // 1 catalog, 2 pages, 3 font, then a page and its content per page, then info
  const objs: { dict: string; stream?: Buffer }[] = [
    { dict: '<< /Type /Catalog /Pages 2 0 R >>' },
    { dict: `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${n} >>` },
    { dict: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>' },
  ];
  pages.forEach((lines, i) => {
    const content = lines.map((l) => `BT /F1 ${l.size ?? 11} Tf ${l.x ?? 72} ${l.y} Td (${esc(l.text)}) Tj ET`).join('\n');
    objs.push({ dict: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>` });
    objs.push({ dict: '<< >>', stream: Buffer.from(content, 'latin1') });
  });
  objs.push({ dict: `<< /Title (${esc(opts.title ?? '')}) /Producer (test) >>` });
  return buildPdf(objs, { root: 1, info: opts.title ? objs.length : undefined });
}
