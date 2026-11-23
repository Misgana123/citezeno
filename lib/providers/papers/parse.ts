import { DOMParser } from 'linkedom';

/* Small helpers the scholarly adapters share for turning vendor records into Papers. */

/* Trimmed text with spaces collapsed, or null when empty. */
export const clean = (v: unknown): string | null => {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s || null;
};

/* Text without HTML/XML tags and entities (abstracts often carry <i>, <sub>, <h4>…). */
export function plain(v: unknown): string | null {
  const s = clean(v);
  if (!s) return null;
  const decoded = s
    .replace(/<\/(p|h\d|div|li|br)\s*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
  return clean(decoded);
}

/* "2021-03-04", "2021-03", "2021" (anything starting with a year) → year and ISO-ish date. */
export function dateParts(v: unknown): { year: number | null; date: string | null } {
  const s = clean(v);
  const m = s?.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
  if (!m) return { year: null, date: null };
  const year = Number(m[1]);
  return { year, date: m[3] ? `${m[1]}-${m[2]}-${m[3]}` : m[2] ? `${m[1]}-${m[2]}` : m[1] };
}

/* ---- XML (arXiv, PubMed) ---- */

export type XmlNode = Element;

export function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, 'text/xml') as unknown as Document;
}

export const all = (n: ParentNode | null | undefined, tag: string): Element[] => (n ? [...(n as Element).getElementsByTagName(tag)] : []);
export const first = (n: ParentNode | null | undefined, tag: string): Element | null => all(n, tag)[0] ?? null;
export const textOf = (n: ParentNode | null | undefined, tag: string): string | null => clean(first(n, tag)?.textContent);
/* Direct children with this tag (not grandchildren). */
export const children = (n: Element | null | undefined, tag: string): Element[] => (n ? [...n.children].filter((c) => c.tagName === tag) : []);

/* ---- search text ---- */

const STOP = new Set(
  'a an and are as at be but by for from has have how in into is it its of on or that the their there these this to was were what when where which while with without within why who will would can could should does do not no than then them they we you your our about after before between during over under via using use used based study studies'.split(
    ' ',
  ),
);

/* The words worth searching for, in order, without repeats or stop words (for
   sources whose search is a word query rather than free text). */
export function searchWords(text: string, max = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}-]+/u)) {
    const w = raw.replace(/^-+|-+$/g, '');
    if (w.length < 2 || STOP.has(w) || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= max) break;
  }
  return out;
}

/* ---- languages ---- */

/* ISO 639-1 ("en") ↔ the three-letter codes and English names some sources use. */
const LANGUAGES: [string, string, string][] = [
  ['en', 'eng', 'english'],
  ['de', 'ger', 'german'],
  ['fr', 'fre', 'french'],
  ['es', 'spa', 'spanish'],
  ['it', 'ita', 'italian'],
  ['pt', 'por', 'portuguese'],
  ['ru', 'rus', 'russian'],
  ['zh', 'chi', 'chinese'],
  ['ja', 'jpn', 'japanese'],
  ['ko', 'kor', 'korean'],
  ['nl', 'dut', 'dutch'],
  ['pl', 'pol', 'polish'],
  ['tr', 'tur', 'turkish'],
  ['ar', 'ara', 'arabic'],
  ['fa', 'per', 'persian'],
  ['sv', 'swe', 'swedish'],
];

export const languageFrom3 = (code: unknown): string | null => {
  const c = clean(code)?.toLowerCase();
  return (c && LANGUAGES.find(([, three]) => three === c)?.[0]) ?? null;
};
export const languageTo3 = (iso: string): string | null => LANGUAGES.find(([two]) => two === iso)?.[1] ?? null;
export const languageName = (iso: string): string | null => LANGUAGES.find(([two]) => two === iso)?.[2] ?? null;
