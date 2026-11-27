'use client';

import type { PageBox } from '@/lib/providers/pdf-text/types';

/* Highlights are anchored so they survive zooming and other screen sizes: the
   page, the text itself with a few words before and after, and its boxes as
   fractions of the page (not pixels). On another copy of the PDF they are found
   again by searching the page's text for the saved quote. */

export type Anchor = { page: number; quote: string; prefix: string; suffix: string; rects: PageBox[] };

const CONTEXT = 32;
const round = (n: number) => Math.round(n * 1e5) / 1e5;
const clamp = (n: number) => Math.min(1, Math.max(0, n));

export const pageOf = (node: Node | null): HTMLElement | null => (node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>('.page[data-page-number]') ?? null;
const textLayerOf = (page: HTMLElement) => page.querySelector<HTMLElement>('.textLayer');

/* The client rects of a range → boxes on the page (fractions), lines merged. */
export function rangeBoxes(range: Range, page: HTMLElement): PageBox[] {
  const p = page.getBoundingClientRect();
  if (!p.width || !p.height) return [];
  const raw = [...range.getClientRects()]
    .filter((r) => r.width > 1 && r.height > 1)
    .map((r) => ({ x: (r.left - p.left) / p.width, y: (r.top - p.top) / p.height, w: r.width / p.width, h: r.height / p.height }))
    .filter((b) => b.x + b.w > 0 && b.x < 1 && b.y + b.h > 0 && b.y < 1)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  // merge boxes on the same line that touch or overlap
  const out: PageBox[] = [];
  for (const b of raw) {
    const last = out.at(-1);
    if (last && Math.abs(last.y - b.y) < Math.max(last.h, b.h) * 0.5 && b.x <= last.x + last.w + 0.01) {
      const x = Math.min(last.x, b.x);
      const right = Math.max(last.x + last.w, b.x + b.w);
      const y = Math.min(last.y, b.y);
      out[out.length - 1] = { x, y, w: right - x, h: Math.max(last.y + last.h, b.y + b.h) - y };
    } else out.push(b);
  }
  return out.slice(0, 200).map((b) => ({ x: round(clamp(b.x)), y: round(clamp(b.y)), w: round(clamp(b.w)), h: round(clamp(b.h)) }));
}

/* A range's text with line ends as spaces (PDF.js ends lines with <br>, which Range.toString skips). */
export function rangeText(range: Range): string {
  const root = range.commonAncestorContainer;
  if (root.nodeType === Node.TEXT_NODE) return range.toString();
  let out = '';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!range.intersectsNode(n)) continue;
    if (n.nodeType === Node.ELEMENT_NODE) {
      if ((n as Element).tagName === 'BR') out += ' ';
      continue;
    }
    const t = n as Text;
    const from = t === range.startContainer ? range.startOffset : 0;
    const to = t === range.endContainer ? range.endOffset : t.data.length;
    out += t.data.slice(from, to);
  }
  return out;
}

/* The current text selection inside one PDF page, anchored; null when there is none. */
export function selectionAnchor(sel: Selection | null): Anchor | null {
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  const page = pageOf(range.startContainer);
  const layer = page && textLayerOf(page);
  if (!page || !layer || !layer.contains(range.startContainer)) return null;
  // a selection running onto the next page is kept to its first page
  const onPage = range.cloneRange();
  if (!layer.contains(range.endContainer)) onPage.setEnd(layer, layer.childNodes.length);
  const quote = rangeText(onPage).replace(/\s+/g, ' ').trim().slice(0, 4000);
  if (!quote) return null;
  const rects = rangeBoxes(onPage, page);
  if (!rects.length) return null;
  const before = document.createRange();
  before.setStart(layer, 0);
  before.setEnd(onPage.startContainer, onPage.startOffset);
  const text = layer.textContent ?? '';
  const start = before.toString().length;
  const end = start + onPage.toString().length;
  return {
    page: Number(page.dataset.pageNumber),
    quote,
    prefix: text.slice(Math.max(0, start - CONTEXT), start).replace(/\s+/g, ' '),
    suffix: text.slice(end, end + CONTEXT).replace(/\s+/g, ' '),
    rects,
  };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* Find saved text on a rendered page again: its boxes, or null when the page doesn't contain it. */
export function locateQuote(page: HTMLElement, quote: string, prefix = ''): PageBox[] | null {
  const layer = textLayerOf(page);
  if (!layer) return null;
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  const starts: number[] = [];
  let text = '';
  for (const n of nodes) {
    starts.push(text.length);
    text += n.data;
  }
  // spacing differs between copies: match the words with any whitespace between them
  const words = quote.split(/\s+/).filter(Boolean).map(escapeRe);
  if (!words.length) return null;
  const re = new RegExp(words.join('\\s*'), 'g');
  let best: { at: number; len: number; score: number } | null = null;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const before = text.slice(Math.max(0, m.index - prefix.length - 8), m.index).replace(/\s+/g, ' ');
    const score = prefix && before.includes(prefix.trim().slice(-12)) ? 1 : 0;
    if (!best || score > best.score) best = { at: m.index, len: m[0].length, score };
    if (score) break;
  }
  if (!best) return null;
  const pos = (offset: number): [Text, number] => {
    let i = starts.length - 1;
    while (i > 0 && starts[i] > offset) i--;
    return [nodes[i], Math.min(offset - starts[i], nodes[i].data.length)];
  };
  const range = document.createRange();
  range.setStart(...pos(best.at));
  range.setEnd(...pos(best.at + best.len));
  const boxes = rangeBoxes(range, page);
  return boxes.length ? boxes : null;
}

/* Whether a point (fractions of the page) falls on one of these boxes. */
export const hits = (boxes: PageBox[], x: number, y: number) => boxes.some((b) => x >= b.x - 0.002 && x <= b.x + b.w + 0.002 && y >= b.y - 0.002 && y <= b.y + b.h + 0.002);
