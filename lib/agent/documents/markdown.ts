import type { DocBlock } from './blocks';

/* Markdown (or plain text) as document blocks, so it can become a Word file or
   a PDF with the same builders: # headings, - and 1. lists, > quotes, | tables,
   --- page breaks, and paragraphs. Inline **bold**, *italic* and links are kept
   as they are (the builders read them). Anything else stays text. */

const TABLE_ROW = /^\s*\|(.+)\|\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const cells = (line: string) =>
  line
    .replace(/^\s*\||\|\s*$/g, '')
    .split('|')
    .map((c) => c.trim());

export function markdownBlocks(md: string): DocBlock[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out: DocBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ type: 'paragraph', text: para.join(' ').trim() });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (!t) {
      flush();
      continue;
    }
    const h = t.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (h) {
      flush();
      out.push({ type: 'heading', text: h[2], level: Math.min(3, h[1].length) });
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      flush();
      out.push({ type: 'page_break' });
      continue;
    }
    if (TABLE_ROW.test(line) && TABLE_RULE.test(lines[i + 1] ?? '')) {
      flush();
      const headers = cells(line);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && TABLE_ROW.test(lines[i]); i++) rows.push(cells(lines[i]));
      i--;
      out.push({ type: 'table', headers, rows });
      continue;
    }
    const bullet = /^[-*+]\s+(.+)$/;
    const numbered = /^\d+[.)]\s+(.+)$/;
    if (bullet.test(t) || numbered.test(t)) {
      flush();
      const re = bullet.test(t) ? bullet : numbered;
      const items: string[] = [];
      for (; i < lines.length && re.test(lines[i].trim()); i++) items.push(lines[i].trim().match(re)![1]);
      i--;
      out.push({ type: re === bullet ? 'bullets' : 'numbered', items });
      continue;
    }
    if (t.startsWith('>')) {
      flush();
      const quote: string[] = [];
      for (; i < lines.length && lines[i].trim().startsWith('>'); i++) quote.push(lines[i].trim().replace(/^>\s?/, ''));
      i--;
      out.push({ type: 'quote', text: quote.join(' ') });
      continue;
    }
    para.push(t);
  }
  flush();
  return out.length ? out : [{ type: 'paragraph', text: '' }];
}
