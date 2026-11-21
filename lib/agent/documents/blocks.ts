import { z } from 'zod';

/* The one content format the assistant writes documents in. The model sends
   these blocks as JSON; the Word and PDF builders lay them out. Text may use
   **bold**, *italic* and [links](https://…); nothing else is interpreted. */

export const DOC_BLOCKS_MAX = 400;
export const DOC_TEXT_MAX = 200_000;
const TEXT = z.string().max(20_000);
const ITEMS = z.array(TEXT).min(1).max(200);

export const blockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('heading'), text: z.string().min(1).max(500), level: z.number().int().min(1).max(3).optional().describe('1 (default), 2 or 3') }),
  z.object({ type: z.literal('paragraph'), text: TEXT }),
  z.object({ type: z.literal('bullets'), items: ITEMS }),
  z.object({ type: z.literal('numbered'), items: ITEMS }),
  z.object({ type: z.literal('quote'), text: TEXT }),
  z.object({ type: z.literal('table'), headers: z.array(z.string().max(500)).min(1).max(20), rows: z.array(z.array(z.string().max(2000)).max(20)).max(500) }),
  z.object({
    type: z.literal('image'),
    fileId: z.string().min(1).max(80).describe('A picture the assistant made in this chat (e.g. a chart), by its fileId.'),
    caption: z.string().max(500).optional(),
  }),
  z.object({
    type: z.literal('references'),
    title: z.string().max(200).optional().describe('Default "References".'),
    items: ITEMS.describe('Each reference exactly as a tool returned it (find_citations, or the paper tools); never invented.'),
  }),
  z.object({ type: z.literal('page_break') }),
]);

export type DocBlock = z.infer<typeof blockSchema>;

export const documentInput = {
  filename: z.string().trim().min(1).max(120).describe('The file name, without the extension.'),
  title: z.string().max(300).optional().describe('Shown at the top of the first page and in the file’s properties.'),
  author: z.string().max(200).optional(),
  blocks: z.array(blockSchema).min(1).max(DOC_BLOCKS_MAX),
};

/* All the text in the blocks, to keep one document within reason. */
export function textLength(blocks: DocBlock[]): number {
  let n = 0;
  for (const b of blocks) {
    if ('text' in b) n += b.text.length;
    if ('items' in b) n += b.items.reduce((m, s) => m + s.length, 0);
    if (b.type === 'table') n += [b.headers, ...b.rows].reduce((m, r) => m + r.reduce((k, c) => k + c.length, 0), 0);
  }
  return n;
}

/* ---------- inline text ---------- */

export type Span = { text: string; bold?: boolean; italic?: boolean; link?: string };

/* **bold**, *italic* / _italic_, [text](https://…). Unclosed marks stay as text. */
export function spans(text: string): Span[] {
  const out: Span[] = [];
  const push = (s: Span) => {
    if (!s.text) return;
    const last = out.at(-1);
    if (last && last.bold === s.bold && last.italic === s.italic && last.link === s.link) last.text += s.text;
    else out.push(s);
  };
  const walk = (t: string, style: Omit<Span, 'text'>) => {
    const re = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^\n]+?)\*\*(?!\*)|(?<![*\w])\*([^*\n]+?)\*(?!\*)|(?<![_\w])_([^_\n]+?)_(?![_\w])/g;
    let at = 0;
    for (let m = re.exec(t); m; m = re.exec(t)) {
      push({ ...style, text: t.slice(at, m.index) });
      if (m[1] != null) push({ ...style, text: m[1], link: m[2] });
      else if (m[3] != null) walk(m[3], { ...style, bold: true });
      else walk(m[4] ?? m[5], { ...style, italic: true });
      at = m.index + m[0].length;
    }
    push({ ...style, text: t.slice(at) });
  };
  walk(text, {});
  return out.map((s) => Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined && v !== false)) as Span);
}

/* ---------- pictures ---------- */

export type Picture = { type: 'png' | 'jpg'; width: number; height: number };

/* A PNG's or JPEG's type and pixel size from its header (null for anything else). */
export function pictureInfo(b: Uint8Array): Picture | null {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { type: 'png', width: v.getUint32(16), height: v.getUint32(20) };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      const len = (b[i + 2] << 8) | b[i + 3];
      // start of frame (baseline, progressive…): height then width
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { type: 'jpg', height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
      i += 2 + len;
    }
  }
  return null;
}

/* A picture's size on the page: its own size (pixels × `scale` page units per
   pixel), at most `maxWidth` wide, keeping its shape. */
export function fitPicture(p: Picture, maxWidth: number, scale: number): { width: number; height: number } {
  const w = Math.min(maxWidth, p.width * scale);
  return { width: Math.round(w), height: Math.round((p.height * w) / p.width) };
}
