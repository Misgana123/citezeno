import { toPapers } from '../mapper';
import type { OpenAlexClient } from '../openalex/client';
import { CARD_FIELDS, selectParam } from '../openalex/fields';
import type { OpenAlexList } from '../openalex/types';
import type { Paper } from '../types';
import { buildFilter } from './filters';
import { applyServerFilters, paginate, sortPapers } from './postprocess';
import { capText, QUERY_CHARS_LIMIT } from './query-length';
import type { SearchFilters, SearchRequest } from './request';
import type { PaperListResult, SearchNotice } from './types';

/* OpenAlex returns at most 50 semantic results and can't sort them, so we
   fetch all 50 in one call and filter, sort and page them ourselves. */
export const SEMANTIC_MAX = 50;
export const SEMANTIC_PER_PAGE = 25;

export type Pool = { papers: Paper[]; costUsd: number };

/* The top results by meaning (`/works?search.semantic=`), with only the filters semantic search supports. */
export async function semanticPool(client: OpenAlexClient, text: string, filters: SearchFilters): Promise<Pool> {
  const { body, costUsd } = await client.get<OpenAlexList>('/works', {
    'search.semantic': capText(text, QUERY_CHARS_LIMIT),
    filter: buildFilter(filters, 'semantic') || undefined,
    per_page: SEMANTIC_MAX,
    select: selectParam(CARD_FIELDS),
  });
  return { papers: toPapers(body.results), costUsd };
}

/* Shared tail for pooled modes: server filters, sort, page and notices. */
export function listFromPool(
  pool: Paper[],
  req: SearchRequest,
  opts: { mode: 'semantic' | 'smart'; capped: boolean; perPage?: number },
): PaperListResult['list'] {
  const perPage = opts.perPage ?? SEMANTIC_PER_PAGE;
  const filtered = applyServerFilters(pool, req.filters);
  const sorted = sortPapers(filtered, req.sort);
  const { items, hasMore } = paginate(sorted, req.page, perPage);
  const notices: SearchNotice[] = [];
  if (req.truncated) notices.push('query_truncated');
  if (req.filters.minCitations != null) notices.push('filtered_top_results');
  if (opts.capped) notices.push('results_capped');
  return { papers: items, total: sorted.length, page: req.page, perPage, hasMore, mode: opts.mode, sort: req.sort, notices };
}

export async function semanticSearch(client: OpenAlexClient, req: SearchRequest): Promise<PaperListResult> {
  const pool = await semanticPool(client, req.query, req.filters);
  return {
    list: listFromPool(pool.papers, req, { mode: 'semantic', capped: pool.papers.length >= SEMANTIC_MAX }),
    costUsd: pool.costUsd,
    searches: 1,
  };
}
