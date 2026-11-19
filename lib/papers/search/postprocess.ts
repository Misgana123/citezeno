import type { Paper } from '../types';
import type { SearchFilters, SortKey } from './request';

/* Server-side steps for modes where the provider can't filter, sort or page for us
   (semantic search and Smart mode work on a fixed pool of top results). */

/* Filters semantic search doesn't support, applied to its results. */
export function applyServerFilters(papers: Paper[], f: SearchFilters): Paper[] {
  return f.minCitations != null ? papers.filter((p) => p.citedByCount >= (f.minCitations as number)) : papers;
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
