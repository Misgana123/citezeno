'use client';

import { notesMarkdown, pdfFileNames } from '@/lib/shelf/export/notes';
import { toRows, writeFormat } from '@/lib/shelf/export/rows';
import { EXPORT_FILES, type ExportFormat, type ExportRow } from '@/lib/shelf/export/types';
import type { ShelfItem } from '@/lib/shelf/types';
import { zip } from '@/lib/zip';
import { shelfFetch } from '../api';
import { pdfHref } from '../pdf/upload';
import type { Groups } from '../useShelfGroups';

/* Exports are built in the browser from the same listing the page uses (100
   papers per request), so even a very large shelf never makes one huge
   server response. The ZIP adds every note and the user's PDFs. */

const PAGE = 100;

export async function fetchItems(query: URLSearchParams, onProgress?: (done: number, total: number) => void): Promise<ShelfItem[]> {
  const items: ShelfItem[] = [];
  for (let page = 1; ; page++) {
    const qs = new URLSearchParams(query);
    qs.set('page', String(page));
    qs.set('perPage', String(PAGE));
    const r = await shelfFetch<{ items: ShelfItem[]; total: number }>(`/api/shelf/papers?${qs}`);
    items.push(...r.items);
    onProgress?.(items.length, r.total);
    if (!r.items.length || items.length >= r.total) return items;
  }
}

export { toRows, writeFormat };


export function download(data: BlobPart, name: string, mime: string) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const today = () => new Date().toISOString().slice(0, 10);

export async function exportFile(format: ExportFormat, query: URLSearchParams, groups: Groups, baseName: string, onProgress?: (done: number, total: number) => void): Promise<number> {
  const items = await fetchItems(query, onProgress);
  const f = EXPORT_FILES[format];
  download(writeFormat(format, toRows(items, groups)), `${baseName}-${today()}.${f.ext}`, `${f.mime};charset=utf-8`);
  return items.length;
}

/* The whole shelf: BibTeX, RIS and CSV, every note, and every PDF. */
export async function exportEverything(groups: Groups, onProgress: (label: string) => void): Promise<{ papers: number; pdfs: number; missing: string[] }> {
  const items = await fetchItems(new URLSearchParams(), (d, t) => onProgress(`Collecting papers ${d} of ${t}`));
  const rows = toRows(items, groups);
  const names = pdfFileNames(rows);
  const files: { name: string; data: string | Uint8Array }[] = [
    { name: 'library.bib', data: writeFormat('bibtex', rows) },
    { name: 'library.ris', data: writeFormat('ris', rows) },
    { name: 'library.csv', data: writeFormat('csv', rows) },
    { name: 'notes.md', data: notesMarkdown(rows) },
  ];
  const pdfs = rows.flatMap((r) => r.item.pdfs);
  const missing: string[] = [];
  let done = 0;
  for (const f of pdfs) {
    onProgress(`Adding PDFs ${++done} of ${pdfs.length}`);
    try {
      const res = await fetch(pdfHref(f.id), { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      files.push({ name: `pdfs/${names.get(f.id) ?? f.fileName}`, data: new Uint8Array(await res.arrayBuffer()) });
    } catch {
      missing.push(f.fileName);
    }
  }
  files.push({
    name: 'README.txt',
    data: [
      `Your Citezeno shelf, exported ${today()}.`,
      '',
      `${items.length} papers. library.bib (BibTeX) and library.ris (RIS) open in Zotero, Mendeley, EndNote and most reference managers;`,
      'library.csv opens in any spreadsheet; notes.md holds every note you wrote.',
      `pdfs/ holds ${pdfs.length - missing.length} of your ${pdfs.length} uploaded PDFs.`,
      ...(missing.length ? ['', 'These PDFs could not be added to this file; download them from your shelf:', ...missing.map((m) => `  - ${m}`)] : []),
      '',
    ].join('\r\n'),
  });
  onProgress('Making the ZIP file');
  download(zip(files) as Uint8Array<ArrayBuffer>, `citezeno-shelf-${today()}.zip`, 'application/zip');
  return { papers: items.length, pdfs: pdfs.length - missing.length, missing };
}
