/* Reading reference files exported from Zotero, Mendeley, EndNote, JabRef and
   friends: BibTeX (.bib) and RIS (.ris). Runs in the browser; nothing is sent
   anywhere and no database is searched. */
import type { Name, Source, SourceType } from './types';

export type ImportFailure = { label: string; reason: string };
export type ParsedRefs = { sources: Source[]; failed: ImportFailure[]; format: 'bibtex' | 'ris' | 'unknown' };

export const IMPORT_PROVIDER = 'Imported';
/* larger files are almost certainly not a reference list */
export const MAX_IMPORT_BYTES = 5_000_000;

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

export function cleanDoi(v: string | undefined) {
  if (!v) return undefined;
  const m = /10\.\d{4,9}\/\S+/.exec(decodeURIComponent(v.trim()).replace(/^doi:\s*/i, ''));
  return m ? m[0].replace(/[.,;]+$/, '') : undefined;
}

function yearOf(v: string | undefined): number | null {
  const m = /(?:^|\D)(1[5-9]\d\d|20\d\d)(?:\D|$)/.exec(v || '');
  return m ? Number(m[1]) : null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function monthOf(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  if (n >= 1 && n <= 12) return n;
  const k = MONTHS.indexOf(v.trim().slice(0, 3).toLowerCase());
  return k >= 0 ? k + 1 : null;
}

/* "Last, First", "First Last", "Last, Jr., First" or a corporate name. */
export function parseName(raw: string, literal = false): Name | null {
  const s = clean(raw);
  if (!s) return null;
  if (literal) return { family: s, literal: true };
  const parts = s.split(',').map((x) => x.trim());
  if (parts.length >= 3) return { family: parts[0], suffix: parts[1], given: parts.slice(2).join(' ') || undefined };
  // EndNote marks a corporate author with a trailing comma: "World Health Organization,"
  if (parts.length === 2 && !parts[1]) return { family: parts[0], literal: true };
  if (parts.length === 2) return { family: parts[0], given: parts[1] };
  const words = s.split(' ');
  if (words.length === 1) return { family: s };
  // "von Neumann" style particles stay with the family name
  let i = words.length - 1;
  while (i > 0 && /^(van|von|der|den|de|del|della|da|di|du|la|le|ter|ten|bin|al|el)$/i.test(words[i - 1])) i--;
  return { family: words.slice(i).join(' '), given: words.slice(0, i).join(' ') };
}

function pages(start?: string, end?: string) {
  const a = clean(start || '');
  const b = clean(end || '');
  if (a && b && a !== b) return `${a}–${b}`;
  return (a || b).replace(/\s*-{1,2}\s*/g, '–') || undefined;
}

function finish(src: Partial<Source> & { title?: string }, label: string, failed: ImportFailure[]): Source | null {
  const title = clean(src.title || '');
  if (!title) {
    failed.push({ label, reason: 'It has no title.' });
    return null;
  }
  const out: Source = {
    provider: IMPORT_PROVIDER,
    type: src.type || 'article',
    title: title.replace(/[.\s]+$/, ''),
    authors: src.authors || [],
    year: src.year ?? null,
  };
  for (const [k, v] of Object.entries(src)) {
    if (v === undefined || v === '' || k in out) continue;
    (out as Record<string, unknown>)[k] = typeof v === 'string' ? clean(v) : v;
  }
  if (out.doi && !out.url) out.url = `https://doi.org/${out.doi}`;
  // web pages without a site name: use the address's host, so styles don't print a placeholder
  if (out.type === 'web' && !out.site && out.url) {
    try {
      out.site = new URL(out.url).hostname;
    } catch {
      /* not a URL */
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* BibTeX                                                              */
/* ------------------------------------------------------------------ */

const ACCENTS: Record<string, Record<string, string>> = {
  "'": { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', y: 'ý', c: 'ć', n: 'ń', s: 'ś', z: 'ź', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú', C: 'Ć', S: 'Ś', Z: 'Ź' },
  '`': { a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù', A: 'À', E: 'È', O: 'Ò', U: 'Ù' },
  '^': { a: 'â', e: 'ê', i: 'î', o: 'ô', u: 'û', A: 'Â', E: 'Ê', O: 'Ô' },
  '"': { a: 'ä', e: 'ë', i: 'ï', o: 'ö', u: 'ü', y: 'ÿ', A: 'Ä', E: 'Ë', O: 'Ö', U: 'Ü' },
  '~': { a: 'ã', n: 'ñ', o: 'õ', A: 'Ã', N: 'Ñ', O: 'Õ' },
  c: { c: 'ç', C: 'Ç', s: 'ş', S: 'Ş' },
  v: { c: 'č', s: 'š', z: 'ž', r: 'ř', e: 'ě', C: 'Č', S: 'Š', Z: 'Ž', R: 'Ř' },
  u: { a: 'ă', g: 'ğ', A: 'Ă' },
  '=': { a: 'ā', e: 'ē', o: 'ō', u: 'ū' },
  '.': { z: 'ż', Z: 'Ż', I: 'İ' },
  H: { o: 'ő', u: 'ű', O: 'Ő', U: 'Ű' },
  k: { a: 'ą', e: 'ę', A: 'Ą', E: 'Ę' },
};
const SYMBOLS: Record<string, string> = { ss: 'ß', o: 'ø', O: 'Ø', ae: 'æ', AE: 'Æ', oe: 'œ', OE: 'Œ', aa: 'å', AA: 'Å', l: 'ł', L: 'Ł', i: 'ı' };

/* LaTeX markup → plain Unicode text. */
export function delatex(s: string): string {
  let t = s;
  t = t.replace(/\\([`'^"~=.])\s*\{?\\?([a-zA-Z])\}?/g, (m, acc, ch) => ACCENTS[acc]?.[ch] ?? ch);
  t = t.replace(/\\([cvuHk])\s*\{\\?([a-zA-Z])\}/g, (m, acc, ch) => ACCENTS[acc]?.[ch] ?? ch);
  t = t.replace(/\\([cvuHk]) ([a-zA-Z])/g, (m, acc, ch) => ACCENTS[acc]?.[ch] ?? ch);
  t = t.replace(/\{?\\(ss|ae|AE|oe|OE|aa|AA|o|O|l|L|i)\}?(?![a-zA-Z])/g, (m, k) => SYMBOLS[k]);
  t = t.replace(/\\(?:textit|emph|textbf|textsc|textrm|mathrm|text|mbox)\s*\{([^{}]*)\}/g, '$1');
  t = t.replace(/\\(&|%|\$|#|_|\{|\})/g, '$1');
  t = t.replace(/---/g, '—').replace(/--/g, '–').replace(/~/g, ' ');
  t = t.replace(/``|''/g, '"');
  t = t.replace(/\\[a-zA-Z]+\s*/g, '');
  t = t.replace(/[{}]/g, '');
  return clean(t);
}

const BIB_MONTHS: Record<string, string> = Object.fromEntries(MONTHS.map((m, i) => [m, String(i + 1)]));

/* Read `{…}`, `"…"`, numbers and macros joined with `#`, starting at text[i]. */
function readValue(text: string, i: number, strings: Record<string, string>): { value: string; end: number; literal: boolean } {
  let out = '';
  let literal = false;
  for (;;) {
    while (/\s/.test(text[i] || '')) i++;
    const ch = text[i];
    if (ch === '{') {
      let depth = 0;
      const start = i;
      for (; i < text.length; i++) {
        if (text[i] === '\\') {
          i++;
          continue;
        }
        if (text[i] === '{') depth++;
        else if (text[i] === '}' && --depth === 0) break;
      }
      if (depth !== 0) throw new Error('A brace { is never closed.');
      const inner = text.slice(start + 1, i);
      // a value wrapped in an extra pair of braces ({{World Health Organization}}) is a literal name
      literal = /^\{[^{}]*\}$/.test(inner.trim());
      out += inner;
      i++;
    } else if (ch === '"') {
      let depth = 0;
      const start = ++i;
      for (; i < text.length; i++) {
        if (text[i] === '\\') {
          i++;
          continue;
        }
        if (text[i] === '{') depth++;
        else if (text[i] === '}') depth--;
        else if (text[i] === '"' && depth === 0) break;
      }
      if (i >= text.length) throw new Error('A quote " is never closed.');
      out += text.slice(start, i);
      i++;
    } else {
      const m = /^[\w.:+/-]+/.exec(text.slice(i));
      if (!m) throw new Error(`Unexpected “${ch ?? 'end of file'}” in a field.`);
      const word = m[0];
      out += /^\d+$/.test(word) ? word : (strings[word.toLowerCase()] ?? BIB_MONTHS[word.toLowerCase().slice(0, 3)] ?? word);
      i += word.length;
    }
    while (/\s/.test(text[i] || '')) i++;
    if (text[i] === '#') {
      i++;
      continue;
    }
    return { value: out, end: i, literal };
  }
}

type RawEntry = { type: string; key: string; fields: Record<string, string>; literal: Set<string> };

/* Split a .bib file into entries. Broken entries are reported and skipped. */
function bibEntries(text: string, failed: ImportFailure[]): RawEntry[] {
  const strings: Record<string, string> = {};
  const out: RawEntry[] = [];
  let i = 0;
  let n = 0;
  while ((i = text.indexOf('@', i)) >= 0) {
    const head = /^@\s*([a-zA-Z]+)\s*([{(])/.exec(text.slice(i));
    if (!head) {
      i++;
      continue;
    }
    const type = head[1].toLowerCase();
    const close = head[2] === '{' ? '}' : ')';
    let j = i + head[0].length;
    n++;
    if (type === 'comment' || type === 'preamble') {
      // skip to the matching close
      let depth = 1;
      for (; j < text.length && depth; j++) {
        if (text[j] === head[2]) depth++;
        else if (text[j] === close) depth--;
      }
      i = j;
      continue;
    }
    // the next entry start bounds this one, so one broken entry doesn't swallow the file
    const next = text.slice(j).search(/\n\s*@\s*[a-zA-Z]+\s*[{(]/);
    const limit = next >= 0 ? j + next : text.length;
    const entryKey = /^\s*([^,\s}]*)/.exec(text.slice(j))?.[1];
    try {
      if (type === 'string') {
        const m = /^\s*([\w-]+)\s*=\s*/.exec(text.slice(j));
        if (!m) throw new Error('A @string has no name.');
        const v = readValue(text.slice(0, limit), j + m[0].length, strings);
        strings[m[1].toLowerCase()] = v.value;
        i = v.end + 1;
        continue;
      }
      const km = /^\s*([^,\s}]*)\s*,/.exec(text.slice(j, limit));
      const key = km ? km[1] : '';
      if (km) j += km[0].length;
      const fields: Record<string, string> = {};
      const literal = new Set<string>();
      for (;;) {
        while (j < limit && /[\s,]/.test(text[j])) j++;
        if (text[j] === close) break;
        // ran into the next entry (or the end) without closing this one: a brace was left open
        if (j >= limit) throw new Error('The entry is never closed (check for a missing “}”).');
        const fm = /^([a-zA-Z][\w-]*)\s*=\s*/.exec(text.slice(j, limit));
        if (!fm) throw new Error('A field is missing its “=”.');
        const v = readValue(text.slice(0, limit), j + fm[0].length, strings);
        const name = fm[1].toLowerCase();
        fields[name] = v.value;
        if (v.literal) literal.add(name);
        j = v.end;
      }
      out.push({ type, key, fields, literal });
      i = Math.max(j + 1, i + 1);
    } catch (e) {
      failed.push({ label: entryKey ? `@${type}{${entryKey}}` : `Entry ${n}`, reason: `It could not be read: ${(e as Error).message}` });
      i = limit;
    }
  }
  return out;
}

const BIB_TYPES: Record<string, SourceType> = {
  article: 'article', book: 'book', booklet: 'book', inbook: 'chapter', incollection: 'chapter', inproceedings: 'proceedings',
  conference: 'proceedings', proceedings: 'proceedings', phdthesis: 'thesis', mastersthesis: 'thesis', thesis: 'thesis',
  techreport: 'report', report: 'report', manual: 'report', online: 'web', electronic: 'web', www: 'web', webpage: 'web',
  misc: 'article', unpublished: 'preprint', dataset: 'dataset', data: 'dataset',
};

function bibNames(v: string | undefined, wholeLiteral: boolean): Name[] {
  if (!v) return [];
  if (wholeLiteral) return [{ family: delatex(v), literal: true }];
  // split on " and " outside braces
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  const words = v.split(/(\s+and\s+|[{}])/i);
  for (const w of words) {
    if (w === '{') depth++;
    if (w === '}') depth--;
    if (depth === 0 && /^\s+and\s+$/i.test(w)) {
      parts.push(cur);
      cur = '';
    } else cur += w;
  }
  parts.push(cur);
  return parts
    .map((p) => p.trim())
    .filter((p) => p && p.toLowerCase() !== 'others')
    .map((p) => (/^\{[^{}]*\}$/.test(p) ? parseName(delatex(p), true) : parseName(delatex(p))))
    .filter((x): x is Name => !!x);
}

export function parseBibtex(text: string): ParsedRefs {
  const failed: ImportFailure[] = [];
  const sources: Source[] = [];
  for (const e of bibEntries(text, failed)) {
    const f = e.fields;
    const label = e.key ? `@${e.type}{${e.key}}` : `@${e.type}`;
    const type = BIB_TYPES[e.type] ?? 'article';
    const date = f.date || '';
    const isbn = f.isbn ? clean(f.isbn).split(/[\s,;]+/)[0] : undefined;
    const src = finish(
      {
        type: f.url && !f.doi && (e.type === 'misc' || e.type === 'online') && !f.journal && !f.publisher ? 'web' : type,
        title: delatex(f.title || f.booktitle || ''),
        authors: bibNames(f.author, e.literal.has('author')),
        editors: f.editor ? bibNames(f.editor, e.literal.has('editor')) : undefined,
        year: yearOf(f.year) ?? yearOf(date),
        month: monthOf(f.month) ?? (/^\d{4}-(\d\d)/.exec(date) ? Number(/^\d{4}-(\d\d)/.exec(date)![1]) : null),
        container: delatex(f.journal || f.journaltitle || (type === 'chapter' || type === 'proceedings' ? f.booktitle || '' : '') || ''),
        publisher: delatex(f.publisher || f.institution || f.school || f.organization || ''),
        place: delatex(f.address || f.location || ''),
        volume: delatex(f.volume || ''),
        issue: delatex(f.number || f.issue || ''),
        pages: pages(delatex(f.pages || '')),
        doi: cleanDoi(f.doi),
        url: f.url ? clean(f.url) : undefined,
        isbn,
        abstract: f.abstract ? delatex(f.abstract) : undefined,
        keywords: f.keywords ? f.keywords.split(/[,;]/).map((k) => delatex(k)).filter(Boolean) : undefined,
        site: type === 'web' ? delatex(f.organization || f.howpublished || '') || undefined : undefined,
      },
      label,
      failed,
    );
    if (src) sources.push(src);
  }
  return { sources, failed, format: 'bibtex' };
}

/* ------------------------------------------------------------------ */
/* RIS                                                                 */
/* ------------------------------------------------------------------ */

const RIS_TYPES: Record<string, SourceType> = {
  JOUR: 'article', JFULL: 'article', MGZN: 'article', NEWS: 'article', EJOUR: 'article', ABST: 'article',
  BOOK: 'book', EBOOK: 'book', EDBOOK: 'book', CHAP: 'chapter', ECHAP: 'chapter',
  CONF: 'proceedings', CPAPER: 'proceedings', THES: 'thesis', RPRT: 'report', GOVDOC: 'report', STAND: 'report',
  ELEC: 'web', WEB: 'web', BLOG: 'web', DATA: 'dataset', AGGR: 'dataset', UNPB: 'preprint', MANSCPT: 'preprint',
};

export function parseRis(text: string): ParsedRefs {
  const failed: ImportFailure[] = [];
  const sources: Source[] = [];
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  let cur: Record<string, string[]> | null = null;
  let last = '';
  let n = 0;
  const flush = () => {
    if (!cur) return;
    n++;
    const g = (k: string) => (cur![k] || [])[0];
    const ty = (g('TY') || 'JOUR').toUpperCase();
    const type = RIS_TYPES[ty] ?? 'article';
    const title = g('TI') || g('T1') || g('CT') || (type === 'book' ? g('BT') : '') || '';
    const label = title ? `“${clean(title).slice(0, 60)}”` : `Reference ${n}`;
    const people = [...(cur.AU || []), ...(cur.A1 || [])];
    const corporate = (raw: string) => !raw.includes(',') && raw.trim().split(/\s+/).length > 2;
    const date = g('PY') || g('Y1') || g('DA') || '';
    const doi = cleanDoi(g('DO') || (cur.UR || []).find((u) => /doi\.org\//i.test(u)) || (cur.M3 || []).find((u) => /^10\./.test(u)));
    const sn = g('SN') || '';
    const container = g('T2') || g('JF') || g('JO') || g('JA') || g('J2') || g('BT') || '';
    const src = finish(
      {
        type,
        title,
        authors: people.map((a) => parseName(a, corporate(a))).filter((x): x is Name => !!x),
        editors: (cur.A2 || cur.ED || []).length && type !== 'article' ? (cur.A2 || cur.ED).map((a) => parseName(a, corporate(a))).filter((x): x is Name => !!x) : undefined,
        // Y2 is the access date in Zotero's RIS, never the publication year
        year: yearOf(date),
        month: Number(/^\d{4}[/-](\d\d)/.exec(g('DA') || date)?.[1]) || null,
        container: type === 'book' || type === 'thesis' || type === 'report' ? undefined : container,
        publisher: g('PB'),
        place: g('CY') || g('PP'),
        volume: g('VL'),
        issue: g('IS') || g('CP'),
        pages: pages(g('SP'), g('EP')),
        doi,
        url: (cur.UR || cur.L2 || []).find((u) => !/doi\.org\//i.test(u)) || undefined,
        isbn: /^[\d-]{10,17}[\dX]?$/i.test(sn.replace(/\s/g, '')) && sn.replace(/[^\dX]/gi, '').length >= 10 ? sn.split(/[\s;]/)[0] : undefined,
        abstract: g('AB') || g('N2'),
        keywords: cur.KW,
        site: type === 'web' ? container || undefined : undefined,
      },
      label,
      failed,
    );
    if (src) sources.push(src);
    cur = null;
  };
  for (const line of lines) {
    const m = /^([A-Z][A-Z0-9]) {1,2}-(?: ?(.*))?$/.exec(line.replace(/\s+$/, ''));
    if (m) {
      const [, tag, rawValue = ''] = m;
      const value = rawValue.trim();
      if (tag === 'TY') {
        if (cur) flush();
        cur = { TY: [value] };
      } else if (tag === 'ER') flush();
      else if (cur) {
        (cur[tag] = cur[tag] || []).push(value);
        last = tag;
      }
    } else if (cur && line.trim() && last) {
      // a value continued on the next line
      const arr = cur[last];
      arr[arr.length - 1] = `${arr[arr.length - 1]} ${line.trim()}`;
    }
  }
  if (cur) flush();
  return { sources, failed, format: 'ris' };
}

/* ------------------------------------------------------------------ */

export function detectFormat(text: string): ParsedRefs['format'] {
  if (/^\s*TY  -/m.test(text)) return 'ris';
  if (/@\s*[a-zA-Z]+\s*[{(]/.test(text)) return 'bibtex';
  return 'unknown';
}

/* Parse pasted text or a file's contents, whichever format it is. */
export function parseReferences(text: string): ParsedRefs {
  const fmt = detectFormat(text);
  if (fmt === 'ris') return parseRis(text);
  if (fmt === 'bibtex') return parseBibtex(text);
  return { sources: [], failed: [], format: 'unknown' };
}
