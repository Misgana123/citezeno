import type { WorkType } from '@/lib/papers/search/options';
import type { PaperFilters, PaperSort } from '../papers/types';
import { languageTo3, searchWords } from '../papers/parse';

/* Text and SearchFilters → a Europe PMC query. A few key words must all
   match; a longer passage matches any of them (best first). Null when the
   filters rule Europe PMC out. */

const FEW_WORDS = 5;

const TYPES: Partial<Record<WorkType, string>> = {
  article: 'PUB_TYPE:"journal article"',
  review: 'PUB_TYPE:"review"',
  editorial: 'PUB_TYPE:"editorial"',
  letter: 'PUB_TYPE:"letter"',
  preprint: 'SRC:PPR',
};

export function searchQuery(text: string, f?: PaperFilters): string | null {
  const words = searchWords(text, 12);
  if (!words.length) return null;
  const quoted = words.map((w) => (w.includes('-') ? `"${w}"` : w));
  const parts = [words.length <= FEW_WORDS ? `(${quoted.join(' AND ')})` : `(${quoted.join(' OR ')})`];
  if (f) {
    if (f.yearFrom != null || f.yearTo != null) parts.push(`PUB_YEAR:[${f.yearFrom ?? 1000} TO ${f.yearTo ?? 3000}]`);
    if (f.openAccess) parts.push('OPEN_ACCESS:y');
    if (f.language) {
      const three = languageTo3(f.language);
      if (!three) return null;
      parts.push(`LANG:"${three}"`);
    }
    if (f.hasAbstract) parts.push('HAS_ABSTRACT:y');
    if (f.types.length) {
      const known = f.types.map((t) => TYPES[t]).filter(Boolean);
      if (!known.length) return null;
      parts.push(`(${known.join(' OR ')})`);
    }
  }
  let q = parts.join(' AND ');
  if (f?.hideRetracted) q += ' NOT PUB_TYPE:"retracted publication"';
  return q;
}

export function sortParam(sort?: PaperSort): string | undefined {
  if (sort === 'newest') return 'P_PDATE_D desc';
  if (sort === 'cited') return 'CITED desc';
  return undefined;
}
