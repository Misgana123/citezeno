import type { WorkType } from '@/lib/papers/search/options';
import type { PaperFilters, PaperSort } from '../papers/types';
import { languageName, searchWords } from '../papers/parse';

/* Text and SearchFilters → a PubMed search term. A few key words must all
   match; a longer passage matches any of its key words (best first). Returns
   null when the filters rule PubMed out (types it doesn't index). */

const FEW_WORDS = 5;

const TYPES: Partial<Record<WorkType, string>> = {
  article: 'journal article[pt]',
  review: 'review[pt]',
  editorial: 'editorial[pt]',
  letter: 'letter[pt]',
  preprint: 'preprint[pt]',
  dataset: 'dataset[pt]',
  report: 'technical report[pt]',
};

export function searchTerm(text: string, f?: PaperFilters): string | null {
  const words = searchWords(text, 12);
  if (!words.length) return null;
  const parts = [words.length <= FEW_WORDS ? `(${words.join(' ')})` : `(${words.join(' OR ')})`];
  if (f) {
    if (f.yearFrom != null || f.yearTo != null) parts.push(`${f.yearFrom ?? 1800}:${f.yearTo ?? 3000}[dp]`);
    if (f.openAccess) parts.push('free full text[sb]');
    if (f.language) {
      const name = languageName(f.language);
      if (!name) return null;
      parts.push(`${name}[la]`);
    }
    if (f.hasAbstract) parts.push('hasabstract');
    if (f.types.length) {
      const known = f.types.map((t) => TYPES[t]).filter(Boolean);
      if (!known.length) return null;
      parts.push(`(${known.join(' OR ')})`);
    }
  }
  let term = parts.join(' AND ');
  if (f?.hideRetracted) term += ' NOT retracted publication[pt]';
  return term;
}

/* PubMed sorts by relevance or publication date; it has no citation counts. */
export const sortParam = (sort?: PaperSort) => (sort === 'newest' ? 'pub_date' : 'relevance');
