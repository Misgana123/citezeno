import { clip, cleanDoi, httpUrl, labelFor, yearFrom } from './text';
import type { ImportEntry, ParsedFile } from './types';

/* RIS (.ris), as exported by EndNote, Zotero, Mendeley and databases:
   "TY  - JOUR" … "ER  -", one tag per line, long values may wrap. */

const TYPES: Record<string, string> = {
  JOUR: 'article',
  JFULL: 'article',
  MGZN: 'article',
  NEWS: 'article',
  CONF: 'article',
  CPAPER: 'article',
  BOOK: 'book',
  EBOOK: 'book',
  EDBOOK: 'book',
  CHAP: 'book-chapter',
  ECHAP: 'book-chapter',
  THES: 'dissertation',
  RPRT: 'report',
  DATA: 'dataset',
  STAND: 'standard',
};

export function parseRis(src: string): ParsedFile {
  const entries: ImportEntry[] = [];
  const failed: ParsedFile['failed'] = [];
  let tags: Map<string, string[]> | null = null;
  let last: string | null = null;
  let n = 0;

  const finish = () => {
    if (!tags) return;
    n++;
    const one = (...keys: string[]) => keys.map((k) => tags!.get(k)?.[0]?.trim()).find(Boolean) ?? null;
    const title = one('TI', 'T1', 'CT', 'BT');
    const label = labelFor(one('ID'), title, n);
    if (!title) failed.push({ label, reason: 'No title' });
    else {
      const authors = ['AU', 'A1', 'A2', 'ED'].flatMap((k) => tags!.get(k) ?? []).map((a) => {
        const parts = a.split(',').map((p) => p.trim()).filter(Boolean);
        return parts.length >= 2 ? `${parts[1]} ${parts[0]}` : a.trim();
      });
      entries.push({
        label,
        title: title.replace(/\s+/g, ' ').slice(0, 1000),
        authors: [...new Set(authors.filter(Boolean))].slice(0, 200),
        year: yearFrom(one('PY', 'Y1', 'DA', 'Y2')),
        source: clip(one('T2', 'JO', 'JF', 'JA', 'J2', 'PB'), 500),
        doi: cleanDoi(one('DO', 'DOI') ?? (tags.get('UR') ?? []).find((u) => /doi\.org\//i.test(u)) ?? null),
        url: httpUrl(one('UR', 'L2', 'LK')),
        type: TYPES[(one('TY') ?? '').toUpperCase()] ?? 'other',
        abstract: clip(one('AB', 'N2'), 20_000),
      });
    }
    tags = null;
  };

  for (const rawLine of src.replace(/^﻿/, '').split(/\r?\n/)) {
    const m = rawLine.match(/^([A-Z][A-Z0-9])\s{1,2}-\s?(.*)$/);
    if (m) {
      const [, tag, value] = m;
      if (tag === 'TY') {
        finish();
        tags = new Map([['TY', [value.trim()]]]);
      } else if (tag === 'ER') finish();
      else if (tags) tags.set(tag, [...(tags.get(tag) ?? []), value]);
      last = tag;
    } else if (tags && last && rawLine.trim()) {
      // a wrapped value continues the previous tag
      const list = tags.get(last);
      if (list?.length) list[list.length - 1] += ` ${rawLine.trim()}`;
    }
  }
  finish();
  return { format: 'ris', entries, failed };
}
