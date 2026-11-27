import type { Paper } from '../types';
import type { SearchFilters, SortKey, WorkType } from './request';

/* Server-side steps for modes where the provider can't filter, sort or page for us
   (semantic search and Smart mode work on a fixed pool of top results). */

/* Filters semantic search doesn't support, applied to its results. */
export function applyServerFilters(papers: Paper[], f: SearchFilters): Paper[] {
  return f.minCitations != null ? papers.filter((p) => p.citedByCount >= (f.minCitations as number)) : papers;
}

/* Does a paper pass the user's filters? Unknown values (no year, no language,
   no type) pass: a source that doesn't know them isn't proof of a mismatch. */
export function matchesFilters(p: Paper, f: SearchFilters): boolean {
  if (f.yearFrom != null && p.year != null && p.year < f.yearFrom) return false;
  if (f.yearTo != null && p.year != null && p.year > f.yearTo) return false;
  if (f.openAccess && !p.isOpenAccess) return false;
  if (f.types.length && p.type && !f.types.includes(p.type as WorkType)) return false;
  if (f.language && p.language && p.language !== f.language) return false;
  if (f.hasAbstract && !p.abstract) return false;
  if (f.hideRetracted && p.isRetracted) return false;
  return !(f.minCitations != null && p.citedByCount < f.minCitations);
}

const dateKey = (p: Paper) => p.publicationDate ?? (p.year != null ? `${p.year}` : '');

/* Relevance keeps the incoming order; the others sort stably, unknowns last. */
export function sortPapers(papers: Paper[], sort: SortKey): Paper[] {
  if (sort === 'relevance') return papers;
  const indexed = papers.map((p, i) => ({ p, i }));
  indexed.sort((a, b) => {
    const d = sort === 'newest' ? dateKey(b.p).localeCompare(dateKey(a.p)) : b.p.citedByCount - a.p.citedByCount;
    return d || a.i - b.i;
  });
  return indexed.map((x) => x.p);
}

export function paginate<T>(items: T[], page: number, perPage: number) {
  const start = (page - 1) * perPage;
  return { items: items.slice(start, start + perPage), hasMore: start + perPage < items.length };
}
