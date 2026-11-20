import type { Line } from './lines';

/* Clean-up before splitting: drop running headers and footers (the same line
   at the top or bottom of many pages) and page numbers, so they never end up
   inside passages. Line-break hyphens are joined later, when lines become
   paragraphs. */

/* Top and bottom bands of the page where headers, footers and numbers live. */
const MARGIN = 0.09;
const PAGE_NUMBER = /^(?:page\s*)?(?:\d{1,4}|[ivxlc]{1,6})(?:\s*(?:of|\/)\s*\d{1,4})?$/i;

/* The same header on every page, with only its numbers changing. */
const shape = (text: string) => text.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();

const inMargin = (l: Line) => l.y < MARGIN || l.y + l.h > 1 - MARGIN;

export function cleanLines(pages: Line[][]): Line[][] {
  const counts = new Map<string, number>();
  for (const lines of pages) {
    const seen = new Set<string>();
    for (const l of lines) if (inMargin(l)) seen.add(shape(l.text));
    for (const s of seen) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  // repeated on at least 3 pages and on at least 40% of them
  const repeated = new Set([...counts].filter(([, n]) => n >= 3 && n >= pages.length * 0.4).map(([s]) => s));
  return pages.map((lines) => lines.filter((l) => !(inMargin(l) && (PAGE_NUMBER.test(l.text) || repeated.has(shape(l.text))))));
}
