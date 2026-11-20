import type { PageBox } from '@/lib/providers/pdf-text/types';
import { union, type Line } from './lines';

/* Lines → paragraphs and section headings.

   A new paragraph starts after a clear vertical gap, when the text jumps back
   up (a new column or page), or at an indented first line. A heading is a
   short line set apart from the body: larger type, or a numbered or common
   section name standing on its own line. */

export type Block =
  | { kind: 'heading'; text: string; page: number; box: PageBox }
  | { kind: 'para'; text: string; page: number; endPage: number; box: PageBox; words: number };

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const NAMED = /^(?:(?:\d+(?:\.\d+)*\.?|[IVX]+\.?|[A-Z]\.)\s+)?(abstract|introduction|background|related work|literature review|methods?|methodology|materials and methods|data(?: and methods)?|experiments?|results?|findings|discussion|results and discussion|conclusions?|limitations|future work|acknowledge?ments?|references|bibliography|works cited|literature cited|appendix(?:\s+[a-z0-9]+)?|supplementary (?:material|information))\s*:?$/i;
const NUMBERED = /^(?:\d+(?:\.\d+){0,3}\.?|[IVX]{1,5}\.)\s+[A-Z][^.!?]{2,80}$/;

export function isHeadingText(text: string): boolean {
  const t = text.trim();
  if (t.length < 3 || t.length > 90) return false;
  return NAMED.test(t) || NUMBERED.test(t);
}

/* Join a line onto paragraph text: a line-break hyphen inside a word is removed. */
export function joinLine(text: string, next: string): string {
  if (!text) return next;
  if (/[a-z]-$/i.test(text) && /^[a-z]/.test(next)) return text.slice(0, -1) + next;
  return `${text} ${next}`;
}

const wordCount = (s: string) => (s.match(/\S+/g) ?? []).length;

export function toBlocks(pages: Line[][]): Block[] {
  const all = pages.flat();
  const bodySize = median(all.map((l) => l.size));
  const spacing = median(
    pages.flatMap((lines) =>
      lines.slice(1).map((l, i) => l.y - lines[i].y).filter((d) => d > 0 && d < bodySize * 4),
    ),
  ) || bodySize * 1.2;
  const blocks: Block[] = [];
  let para: Extract<Block, { kind: 'para' }> | null = null;
  let prev: Line | null = null;
  const close = () => {
    if (para && para.text.trim()) blocks.push({ ...para, words: wordCount(para.text) });
    para = null;
  };
  for (const l of all) {
    const bigger = l.size > bodySize * 1.15;
    const standsAlone = !prev || prev.page !== l.page || l.y - (prev.y + prev.h) > spacing * 0.6 || bigger;
    if ((isHeadingText(l.text) && standsAlone) || (bigger && l.text.length <= 90 && !/[.,;]$/.test(l.text) && blocks.length > 0)) {
      close();
      blocks.push({ kind: 'heading', text: l.text.replace(/:$/, ''), page: l.page, box: { x: l.x, y: l.y, w: l.w, h: l.h } });
      prev = l;
      continue;
    }
    if (para && prev) {
      const p: Extract<Block, { kind: 'para' }> = para;
      const gap = l.y - (prev.y + prev.h);
      const jumpedUp = l.page === prev.page && l.y < prev.y - spacing * 0.5;
      const indented = l.x > prev.x + bodySize * 0.8 && Math.abs(l.y - prev.y) < spacing * 2;
      const newPage = l.page !== prev.page;
      // a paragraph may run on to the next page or column when the previous line didn't end a sentence
      const continues = (newPage || jumpedUp) && !/[.!?:]["”’)]?$/.test(prev.text);
      if (!continues && (gap > spacing * 0.9 || jumpedUp || newPage || indented)) close();
      else if (para) {
        para = { ...p, text: joinLine(p.text, l.text), endPage: l.page, box: l.page === p.page ? union(p.box, l) : p.box };
        prev = l;
        continue;
      }
    }
    if (!para) para = { kind: 'para', text: l.text, page: l.page, endPage: l.page, box: { x: l.x, y: l.y, w: l.w, h: l.h }, words: 0 };
    prev = l;
  }
  close();
  return blocks;
}
