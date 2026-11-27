import type { ExportRow } from './types';

/* RIS, read by EndNote, Zotero, Mendeley and most reference managers. */

const TYPES: Record<string, string> = {
  article: 'JOUR',
  review: 'JOUR',
  letter: 'JOUR',
  editorial: 'JOUR',
  preprint: 'JOUR',
  book: 'BOOK',
  'book-chapter': 'CHAP',
  dissertation: 'THES',
  report: 'RPRT',
  dataset: 'DATA',
  standard: 'STAND',
};

const line = (tag: string, value: string | number | null | undefined) => (value == null || value === '' ? [] : [`${tag}  - ${String(value).replace(/\s*\r?\n\s*/g, ' ').trim()}`]);

export function toRis(rows: ExportRow[]): string {
  return rows
    .map(({ item, tags }) => {
      const p = item.paper;
      return [
        ...line('TY', TYPES[p.type ?? ''] ?? 'GEN'),
        ...line('TI', p.title),
        ...p.authors.flatMap((a) => line('AU', a.name)),
        ...line('PY', p.year),
        ...line(p.type === 'book' ? 'PB' : 'T2', p.source),
        ...line('DO', p.doi),
        ...line('UR', p.landingUrl ?? (p.doi ? `https://doi.org/${p.doi}` : null)),
        ...line('AB', p.abstract),
        ...tags.flatMap((t) => line('KW', t)),
        ...line('N1', item.note),
        'ER  - ',
      ].join('\r\n');
    })
    .join('\r\n\r\n')
    .concat(rows.length ? '\r\n' : '');
}
