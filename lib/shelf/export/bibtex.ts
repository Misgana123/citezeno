import type { ExportRow } from './types';

/* BibTeX that Zotero, JabRef, Overleaf and biber all read. Keys look like
   "lovelace2020engines"; repeats get a, b, c… */

const TYPES: Record<string, string> = {
  article: 'article',
  review: 'article',
  letter: 'article',
  editorial: 'article',
  preprint: 'misc',
  book: 'book',
  'book-chapter': 'incollection',
  dissertation: 'phdthesis',
  report: 'techreport',
  dataset: 'misc',
  standard: 'misc',
};
const SOURCE_FIELD: Record<string, string> = { article: 'journal', incollection: 'booktitle', book: 'publisher', phdthesis: 'school', techreport: 'institution', misc: 'howpublished' };

const ascii = (s: string) => s.normalize('NFKD').replace(/[^\x00-\x7f]/g, '');

/* Special characters escaped; braces kept balanced so a value can't break out. */
export function bibValue(s: string): string {
  let out = s.replace(/\\/g, '\\textbackslash{}').replace(/([&%$#_])/g, '\\$1').replace(/~/g, '\\textasciitilde{}').replace(/\^/g, '\\textasciicircum{}');
  let depth = 0;
  let clean = '';
  for (const ch of out) {
    if (ch === '{') depth++;
    if (ch === '}') {
      if (depth === 0) continue;
      depth--;
    }
    clean += ch;
  }
  out = clean + '}'.repeat(depth);
  return out.replace(/\s+/g, ' ').trim();
}

export function citeKey(row: ExportRow): string {
  const p = row.item.paper;
  const last = p.authors[0]?.name.trim().split(/\s+/).pop() ?? 'anon';
  const word = p.title.split(/\s+/).map((w) => ascii(w).toLowerCase().replace(/[^a-z0-9]/g, '')).find((w) => w.length > 3 && !['the', 'and', 'with', 'from', 'that', 'this'].includes(w)) ?? 'paper';
  return `${ascii(last).toLowerCase().replace(/[^a-z0-9]/g, '') || 'anon'}${p.year ?? ''}${word}`;
}

export function toBibtex(rows: ExportRow[]): string {
  const used = new Map<string, number>();
  return rows
    .map((row) => {
      const p = row.item.paper;
      let key = citeKey(row);
      const n = used.get(key) ?? 0;
      used.set(key, n + 1);
      if (n > 0) key += String.fromCharCode(96 + Math.min(n, 26));
      const type = TYPES[p.type ?? ''] ?? (p.source ? 'article' : 'misc');
      const fields: [string, string | null | undefined][] = [
        ['title', p.title && `{${bibValue(p.title)}}`],
        ['author', p.authors.length ? p.authors.map((a) => bibValue(a.name)).join(' and ') : null],
        ['year', p.year != null ? String(p.year) : null],
        [SOURCE_FIELD[type] ?? 'journal', p.source && bibValue(p.source)],
        ['doi', p.doi],
        ['url', p.landingUrl ?? (p.doi ? `https://doi.org/${p.doi}` : null)],
        ['abstract', p.abstract && bibValue(p.abstract)],
        ['keywords', row.tags.length ? bibValue(row.tags.join(', ')) : null],
        ['annote', row.item.note && bibValue(row.item.note)],
      ];
      const body = fields
        .filter(([, v]) => v)
        .map(([k, v]) => `  ${k} = {${v}}`)
        .join(',\n');
      return `@${type}{${key},\n${body}\n}`;
    })
    .join('\n\n')
    .concat(rows.length ? '\n' : '');
}
