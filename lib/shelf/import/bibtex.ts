import { clip, cleanDoi, httpUrl, labelFor, latexToText, personName, yearFrom } from './text';
import type { ImportEntry, ParsedFile } from './types';

/* BibTeX (.bib), as exported by Zotero, Mendeley, JabRef and most tools:
   @type{key, field = {value} | "value" | number | macro, ...}. Handles nested
   braces, @string macros, # concatenation and LaTeX accents; skips @comment
   and @preamble. */

const TYPES: Record<string, string> = {
  article: 'article',
  inproceedings: 'article',
  conference: 'article',
  book: 'book',
  inbook: 'book-chapter',
  incollection: 'book-chapter',
  phdthesis: 'dissertation',
  mastersthesis: 'dissertation',
  thesis: 'dissertation',
  techreport: 'report',
  report: 'report',
  dataset: 'dataset',
  misc: 'other',
  online: 'other',
  unpublished: 'other',
};
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/* Read one value starting at i: {…}, "…", a number or a macro name, joined by #. */
function readValue(src: string, i: number, macros: Map<string, string>): { value: string; end: number } {
  let value = '';
  for (;;) {
    while (/\s/.test(src[i] ?? '')) i++;
    const c = src[i];
    if (c === '{') {
      let depth = 0;
      const start = i + 1;
      for (; i < src.length; i++) {
        if (src[i] === '\\') i++;
        else if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) break;
      }
      value += src.slice(start, i);
      i++;
    } else if (c === '"') {
      let depth = 0;
      const start = ++i;
      for (; i < src.length; i++) {
        if (src[i] === '\\') i++;
        else if (src[i] === '{') depth++;
        else if (src[i] === '}') depth--;
        else if (src[i] === '"' && depth <= 0) break;
      }
      value += src.slice(start, i);
      i++;
    } else {
      const m = src.slice(i).match(/^[^\s,#}]+/);
      const word = m?.[0] ?? '';
      value += macros.get(word.toLowerCase()) ?? word;
      i += word.length;
    }
    while (/\s/.test(src[i] ?? '')) i++;
    if (src[i] !== '#') return { value, end: i };
    i++;
  }
}

function readFields(body: string, macros: Map<string, string>): Map<string, string> {
  const fields = new Map<string, string>();
  let i = 0;
  while (i < body.length) {
    const m = body.slice(i).match(/^[\s,]*([A-Za-z][\w-]*)\s*=/);
    if (!m) break;
    const { value, end } = readValue(body, i + m[0].length, macros);
    fields.set(m[1].toLowerCase(), value);
    i = end;
  }
  return fields;
}

/* Each @…{…} block, with balanced braces (or parentheses). */
function* blocks(src: string): Generator<{ type: string; body: string }> {
  const re = /@\s*([A-Za-z]+)\s*([{(])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const open = m[2];
    const close = open === '{' ? '}' : ')';
    let depth = 1;
    let i = re.lastIndex;
    for (; i < src.length; i++) {
      if (src[i] === '\\') i++;
      else if (src[i] === open) depth++;
      else if (src[i] === close && --depth === 0) break;
    }
    yield { type: m[1].toLowerCase(), body: src.slice(re.lastIndex, i) };
    re.lastIndex = i + 1;
  }
}

export function parseBibtex(src: string): ParsedFile {
  const macros = new Map<string, string>(MONTHS.map((mo, n) => [mo, String(n + 1)]));
  const entries: ImportEntry[] = [];
  const failed: ParsedFile['failed'] = [];
  let n = 0;
  for (const { type, body } of blocks(src)) {
    if (type === 'comment' || type === 'preamble') continue;
    if (type === 'string') {
      for (const [k, v] of readFields(body, macros)) macros.set(k, v);
      continue;
    }
    n++;
    const comma = body.indexOf(',');
    const key = (comma >= 0 ? body.slice(0, comma) : body).trim() || null;
    const fields = readFields(comma >= 0 ? body.slice(comma + 1) : '', macros);
    const f = (k: string) => {
      const v = fields.get(k);
      return v != null ? latexToText(v) || null : null;
    };
    const title = f('title');
    const label = labelFor(key, title, n);
    if (!title) {
      failed.push({ label, reason: 'No title' });
      continue;
    }
    const authorsRaw = fields.get('author') ?? fields.get('editor') ?? '';
    entries.push({
      label,
      title: title.slice(0, 1000),
      authors: authorsRaw
        .split(/\s+and\s+/i)
        .map((a) => personName(latexToText(a)))
        .filter((a) => a && a.toLowerCase() !== 'others')
        .slice(0, 200),
      year: yearFrom(f('year') ?? f('date')),
      source: clip(f('journal') ?? f('journaltitle') ?? f('booktitle') ?? f('publisher') ?? f('school') ?? f('institution') ?? f('howpublished'), 500),
      doi: cleanDoi(fields.get('doi')),
      url: httpUrl(fields.get('url')),
      type: TYPES[type] ?? 'other',
      abstract: clip(f('abstract'), 20_000),
    });
  }
  return { format: 'bibtex', entries, failed };
}
