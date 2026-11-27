import type { PageBox, PageText } from '@/lib/providers/pdf-text/types';

/* Text runs → lines. PDF.js gives runs in drawing order (for papers that is
   reading order, column by column); a line ends where the PDF ends it, or
   where the next run sits on a different baseline. */

export type Line = PageBox & { page: number; text: string; size: number };

export const union = (a: PageBox, b: PageBox): PageBox => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

export function pageLines(page: PageText): Line[] {
  const lines: Line[] = [];
  let cur: Line | null = null;
  const close = () => {
    if (cur && cur.text.trim()) lines.push({ ...cur, text: cur.text.replace(/\s+/g, ' ').trim() });
    cur = null;
  };
  for (const it of page.items) {
    // rotated runs are margin stamps and labels, not the running text
    if (it.vertical) continue;
    if (it.str) {
      if (cur) {
        const c: Line = cur;
        const sameLine = Math.abs(it.y + it.h - (c.y + c.h)) < Math.max(it.h, c.h) * 0.5 && it.x >= c.x - 0.01;
        if (!sameLine) close();
      }
      if (!cur) cur = { page: page.page, text: it.str, x: it.x, y: it.y, w: it.w, h: it.h, size: it.size };
      else {
        const c: Line = cur;
        // a visible gap between runs is a space, unless one is already there
        const gap = it.x - (c.x + c.w);
        const space = gap > it.h * 0.15 && !/\s$/.test(c.text) && !/^\s/.test(it.str) ? ' ' : '';
        cur = { ...union(c, it), page: c.page, text: c.text + space + it.str, size: Math.max(c.size, it.size) };
      }
    }
    if (it.eol) close();
  }
  close();
  return lines;
}
