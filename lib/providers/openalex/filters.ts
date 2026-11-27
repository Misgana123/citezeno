import type { PaperFilters as SearchFilters, PaperSort as SortKey } from '../papers/types';

/* SearchFilters → OpenAlex `filter=` and `sort=` values. */

export type FilterTarget = 'keyword' | 'semantic';

function yearClause(from: number | null, to: number | null) {
  if (from != null && to != null) return from === to ? `publication_year:${from}` : `publication_year:${from}-${to}`;
  if (from != null) return `publication_year:>${from - 1}`;
  if (to != null) return `publication_year:<${to + 1}`;
  return null;
}

/* Filters semantic search rejects; Smart mode applies these on our server. */
export function unsupportedBySemantic(f: SearchFilters): (keyof SearchFilters)[] {
  return f.minCitations != null ? ['minCitations'] : [];
}

/* The OpenAlex filter string. Semantic search gets only the filters it supports. */
export function buildFilter(f: SearchFilters, target: FilterTarget, extra: string[] = []): string {
  const parts = [
    ...extra,
    yearClause(f.yearFrom, f.yearTo),
    f.openAccess ? 'is_oa:true' : null,
    f.types.length ? `type:${f.types.join('|')}` : null,
    f.language ? `language:${f.language}` : null,
    f.hasAbstract ? 'has_abstract:true' : null,
    f.hideRetracted ? 'is_retracted:false' : null,
    target === 'keyword' && f.minCitations != null ? `cited_by_count:>${f.minCitations - 1}` : null,
  ];
  return parts.filter(Boolean).join(',');
}

/* The OpenAlex sort param; relevance is OpenAlex's default when searching. */
export function sortParam(sort: SortKey): string | undefined {
  if (sort === 'newest') return 'publication_date:desc';
  if (sort === 'cited') return 'cited_by_count:desc';
  return undefined;
}
