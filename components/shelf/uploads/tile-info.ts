import type { ShelfItem } from '@/lib/shelf/types';
import { authorsShort } from '../../papers/format';
import { fileSize } from '../pdf/upload';

/* What an upload tile shows, worked out from the shelf item (kept apart from
   the markup so it can be tested). */

export type TileInfo = {
  /* the PDF to open: the newest one on the item */
  pdfId: string | null;
  pages: number | null;
  /* "2.1 MB · 18 pages · Mar 4" */
  meta: string;
  /* "Matched · Ivanov, Dolgui · 2021", or null for the user's own document */
  match: string | null;
  /* 0 to 1, or null when it hasn't been opened */
  progress: number | null;
  /* "Continue" once reading has started and isn't finished */
  action: 'Read' | 'Continue';
  /* the reader's "Page 6 of 18" */
  where: string | null;
};

const DAY = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });
const DAY_YEAR = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' });

export function addedLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days < 1 && d.getDate() === now.getDate()) return 'Today';
  if (days < 2) return 'Yesterday';
  return (d.getFullYear() === now.getFullYear() ? DAY : DAY_YEAR).format(d);
}

export function tileInfo(item: ShelfItem, now = new Date()): TileInfo {
  const pdf = item.pdfs.at(-1) ?? null;
  const pages = item.reading?.pageCount ?? pdf?.pageCount ?? null;
  const page = item.reading?.page ?? null;
  const progress = page && pages ? Math.min(1, page / pages) : null;
  const p = item.paper;
  return {
    pdfId: pdf?.id ?? null,
    pages,
    meta: [pdf ? fileSize(pdf.sizeBytes) : null, pages ? `${pages} page${pages === 1 ? '' : 's'}` : null, addedLabel(item.addedAt, now)].filter(Boolean).join(' · '),
    match: p.origin === 'provider' ? ['Matched', p.authors.length ? authorsShort(p.authors, 2) : null, p.year].filter(Boolean).join(' · ') : null,
    progress,
    action: page && page > 1 && (!pages || page < pages) ? 'Continue' : 'Read',
    where: page && pages ? `Page ${page} of ${pages}` : null,
  };
}
