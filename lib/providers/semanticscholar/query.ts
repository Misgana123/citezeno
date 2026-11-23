import type { WorkType } from '@/lib/papers/search/options';
import type { PaperFilters } from '../papers/types';
import type { QueryParams } from '../papers/http';

/* SearchFilters → Semantic Scholar search parameters. Language, abstracts and
   retractions can't be filtered there; Find Papers applies what it can on its
   own server. Null when the filters rule it out (types it doesn't index). */

const TYPES: Partial<Record<WorkType, string>> = {
  article: 'JournalArticle',
  review: 'Review',
  editorial: 'Editorial',
  letter: 'LettersAndComments',
  dataset: 'Dataset',
  book: 'Book',
  'book-chapter': 'BookSection',
};

export function filterParams(f?: PaperFilters): QueryParams | null {
  if (!f) return {};
  const params: QueryParams = {};
  if (f.yearFrom != null || f.yearTo != null) params.year = `${f.yearFrom ?? ''}-${f.yearTo ?? ''}`;
  if (f.openAccess) params.openAccessPdf = '';
  if (f.minCitations != null) params.minCitationCount = f.minCitations;
  if (f.types.length) {
    const known = f.types.map((t) => TYPES[t]).filter(Boolean);
    if (!known.length) return null;
    params.publicationTypes = known.join(',');
  }
  return params;
}
