import type { PaperFilters, PaperSort } from '../papers/types';
import { searchWords } from '../papers/parse';

/* SearchFilters and text → arXiv's search_query. arXiv searches words, so free
   text becomes its key words: all of them when there are a few, any of them
   (best matches first) for a longer passage. Returns null when the filters
   rule arXiv out entirely (it only has English preprints, without citation
   counts), so the caller can answer "nothing" without a call. */

const FEW_WORDS = 4;

export function searchQuery(text: string, f?: PaperFilters): string | null {
  if (f && !possible(f)) return null;
  const words = searchWords(text, 12);
  if (!words.length) return null;
  const terms = words.map((w) => (w.includes('-') ? `all:"${w.replace(/"/g, '')}"` : `all:${w}`));
  let q = terms.length <= FEW_WORDS ? terms.join(' AND ') : `(${terms.join(' OR ')})`;
  const years = f ? yearRange(f.yearFrom, f.yearTo) : null;
  if (years) q = `${q} AND ${years}`;
  return q;
}

function possible(f: PaperFilters) {
  if (f.types.length && !f.types.includes('preprint')) return false;
  if (f.language && f.language !== 'en') return false;
  return !(f.minCitations != null && f.minCitations > 0);
}

function yearRange(from: number | null, to: number | null) {
  if (from == null && to == null) return null;
  return `submittedDate:[${from ?? 1991}01010000 TO ${to ?? 9999}12312359]`;
}

/* arXiv sorts by relevance or date; "most cited" has no meaning there. */
export function sortParams(sort?: PaperSort): { sortBy: string; sortOrder: string } {
  return sort === 'newest' ? { sortBy: 'submittedDate', sortOrder: 'descending' } : { sortBy: 'relevance', sortOrder: 'descending' };
}
