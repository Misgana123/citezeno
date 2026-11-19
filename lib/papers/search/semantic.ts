import type { PaperSource } from '@/lib/providers/papers/types';
import { PapersError } from '../errors';
import type { Paper } from '../types';
import { applyServerFilters, paginate, sortPapers } from './postprocess';
import type { SearchFilters, SearchRequest } from './request';
import type { PaperListResult, SearchNotice } from './types';

/* Search by meaning returns a fixed pool of top results (OpenAlex: 50) that
   the provider can't sort, so we fetch the whole pool in one call and filter,
   sort and page it ourselves. */
export const SEMANTIC_PER_PAGE = 25;

export type Pool = { papers: Paper[]; costUsd: number };

/* The source's top results by meaning, with the filters it supports (the rest are applied here afterwards). */
export async function semanticPool(papers: PaperSource, text: string, filters: SearchFilters): Promise<Pool> {
  if (!papers.semanticSearch) throw new PapersError('bad_request', 'Search by meaning isn’t available right now. Try a keyword search.');
  return papers.semanticSearch({ text, filters, limit: papers.limits.semanticMax });
}

/* Whether a pool came back full, so there may be more matches than it holds. */
export const poolCapped = (papers: PaperSource, pool: Pool) => pool.papers.length >= papers.limits.semanticMax;

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

export async function semanticSearch(papers: PaperSource, req: SearchRequest): Promise<PaperListResult> {
  const pool = await semanticPool(papers, req.query, req.filters);
  return {
    list: listFromPool(pool.papers, req, { mode: 'semantic', capped: poolCapped(papers, pool) }),
    costUsd: pool.costUsd,
    searches: 1,
  };
}
