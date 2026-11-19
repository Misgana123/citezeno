import type { PaperAuthor } from '@/lib/papers/types';
import type { WorkType } from '@/lib/papers/search/options';

/* Display helpers for paper cards and the preview. */

/* "Ada Lovelace, Alan Turing, Grace Hopper et al." */
export function authorsShort(authors: PaperAuthor[], max = 3): string {
  if (!authors.length) return 'No authors listed';
  const names = authors.slice(0, max).map((a) => a.name);
  return authors.length > max ? `${names.join(', ')} et al.` : names.join(', ');
}

export const TYPE_LABELS: Record<WorkType, string> = {
  article: 'Article',
  book: 'Book',
  'book-chapter': 'Book chapter',
  preprint: 'Preprint',
  dataset: 'Dataset',
  dissertation: 'Dissertation',
  review: 'Review',
  report: 'Report',
  editorial: 'Editorial',
  letter: 'Letter',
  standard: 'Standard',
  other: 'Other',
};

export function typeLabel(type: string | null): string | null {
  if (!type) return null;
  return TYPE_LABELS[type as WorkType] ?? type.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/* Languages offered in the filter (ISO 639-1), shown by name. */
export const LANGUAGES = ['en', 'es', 'fr', 'de', 'pt', 'it', 'nl', 'ru', 'zh', 'ja', 'ko', 'ar', 'tr', 'pl', 'sv', 'id', 'fa', 'hi', 'uk', 'cs'] as const;

let names: Intl.DisplayNames | null = null;
export function languageName(code: string | null): string | null {
  if (!code) return null;
  try {
    names ??= new Intl.DisplayNames(['en'], { type: 'language' });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

export const formatCount = (n: number) => n.toLocaleString('en-US');

export const citationLabel = (n: number) => `${formatCount(n)} citation${n === 1 ? '' : 's'}`;

export const doiHref = (doi: string) => `https://doi.org/${doi}`;
