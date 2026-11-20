import type { PageBox } from '@/lib/providers/pdf-text/types';
import { union } from './lines';
import type { Block } from './paragraphs';

/* Paragraphs → passages of about one paragraph each (roughly 100–300 words):
   - a very short paragraph joins the next; a very long one is split at sentence ends
   - a passage never crosses a section heading
   - neighbouring passages in a section overlap by one sentence
   - the References section is kept but marked, and everything after it until an appendix
   IDs name the page and the passage's place on it: "p12-3". */

export type Passage = {
  id: string;
  ord: number;
  page: number;
  section: string | null;
  isReferences: boolean;
  text: string;
  tokens: number;
  box: PageBox & { endPage?: number };
};

export const MIN_WORDS = 100;
export const MAX_WORDS = 300;

/* About 1.33 tokens a word for English. */
export const tokensOf = (text: string) => Math.ceil((text.match(/\S+/g) ?? []).length * 1.33);

const REFERENCES = /^(?:(?:\d+\.?|[IVX]+\.?)\s+)?(references|bibliography|works cited|literature cited|reference list)$/i;
const AFTER_REFERENCES = /^(?:(?:\d+\.?|[A-Z]\.?)\s+)?(appendix|appendices|supplementary|supporting information)/i;

/* Sentences, keeping their end marks. Abbreviations ("e.g.", "et al.", "Fig."),
   initials ("J. Smith") and decimals ("3.5") don't end one. */
const ABBREV = /\b(?:e\.g|i\.e|et al|etc|vs|fig|figs|eq|eqs|ref|refs|no|vol|pp|cf|approx|ca|dr|mr|ms|st|sec|tab)\.$/i;

export function sentences(text: string): string[] {
  const out: string[] = [];
  const re = /[^.!?]+(?:[.!?]+["”’)\]]*|$)/g;
  let buf = '';
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && m[0]) {
    buf += m[0];
    const t = buf.trim();
    const rest = text.slice(re.lastIndex);
    const decimal = /\d\.$/.test(t) && /^\d/.test(rest);
    const initial = /(?:^|\s)[A-Z]\.$/.test(t);
    if (rest && (ABBREV.test(t) || decimal || initial)) continue;
    if (t) out.push(t);
    buf = '';
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

type Draft = { text: string; page: number; endPage: number; box: PageBox; section: string | null; isReferences: boolean };

const wordsOf = (s: string) => (s.match(/\S+/g) ?? []).length;

/* Split a long text at sentence ends into pieces of at most MAX_WORDS. */
function splitLong(text: string): string[] {
  const parts: string[] = [];
  let cur: string[] = [];
  let n = 0;
  for (const s of sentences(text)) {
    const w = wordsOf(s);
    if (n + w > MAX_WORDS && n >= MIN_WORDS) {
      parts.push(cur.join(' '));
      cur = [];
      n = 0;
    }
    cur.push(s);
    n += w;
  }
  if (cur.length) parts.push(cur.join(' '));
  return parts;
}

export function toPassages(blocks: Block[]): Passage[] {
  const drafts: Draft[] = [];
  let section: string | null = null;
  let inRefs = false;
  let pending: Draft | null = null;
  const flush = () => {
    if (pending) drafts.push(pending);
    pending = null;
  };
  for (const b of blocks) {
    if (b.kind === 'heading') {
      flush();
      section = b.text;
      if (REFERENCES.test(b.text)) inRefs = true;
      else if (AFTER_REFERENCES.test(b.text)) inRefs = false;
      continue;
    }
    const chunk: Draft = { text: b.text, page: b.page, endPage: b.endPage, box: b.box, section, isReferences: inRefs };
    if (pending) {
      const p: Draft = pending;
      pending = { ...p, text: `${p.text} ${chunk.text}`, endPage: chunk.endPage, box: chunk.page === p.page ? union(p.box, chunk.box) : p.box };
    } else pending = chunk;
    if (wordsOf(pending!.text) >= MIN_WORDS) flush();
  }
  flush();

  // long ones split at sentence ends (each piece keeps the paragraph's place)
  const sized = drafts.flatMap((d) => (wordsOf(d.text) > MAX_WORDS ? splitLong(d.text).map((text) => ({ ...d, text })) : [d]));

  const perPage = new Map<number, number>();
  const out: Passage[] = [];
  sized.forEach((d, i) => {
    const prev = sized[i - 1];
    // one sentence of overlap with the passage before, within the same section
    const overlap = prev && prev.section === d.section && prev.isReferences === d.isReferences && !d.isReferences ? sentences(prev.text).at(-1) : undefined;
    const text = overlap && !d.text.startsWith(overlap) ? `${overlap} ${d.text}` : d.text;
    const n = (perPage.get(d.page) ?? 0) + 1;
    perPage.set(d.page, n);
    out.push({
      id: `p${d.page}-${n}`,
      ord: i,
      page: d.page,
      section: d.section,
      isReferences: d.isReferences,
      text,
      tokens: tokensOf(text),
      box: { ...d.box, ...(d.endPage !== d.page ? { endPage: d.endPage } : {}) },
    });
  });
  return out;
}
