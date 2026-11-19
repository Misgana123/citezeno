import type { PaperSources } from '@/lib/providers/papers/sources';
import type { PaperSource } from '@/lib/providers/papers/types';
import { fuseRanked } from './fuse';
import type { SearchFilters, SearchRequest } from './request';
import { listFromPool, poolCapped, semanticPool, type Pool } from './semantic';
import type { PaperListResult } from './types';

/* Smart mode: keyword and semantic search side by side, merged with Reciprocal
   Rank Fusion on our server. Costs two searches. Keyword results come from the
   primary source; the meaning search from the first source that offers it.
   With none, Smart mode is a keyword search over the same pool. */

export const SMART_KEYWORD_POOL = 50;

/* The top keyword results by relevance, with every filter. */
export async function keywordPool(papers: PaperSource, query: string, filters: SearchFilters): Promise<Pool & { total: number }> {
  return papers.search({ text: query, filters, perPage: SMART_KEYWORD_POOL });
}

export async function smartSearch(sources: PaperSources, req: SearchRequest): Promise<PaperListResult> {
  const meaning = sources.withCapability('semantic_search');
  const [keyword, semantic] = await Promise.all([
    keywordPool(sources.primary, req.query, req.filters),
    meaning ? semanticPool(meaning, req.query, req.filters) : null,
  ]);
  const merged = semantic ? fuseRanked([keyword.papers, semantic.papers]) : keyword.papers;
  const capped = keyword.total > keyword.papers.length || (!!semantic && !!meaning && poolCapped(meaning, semantic));
  return {
    list: listFromPool(merged, req, { mode: 'smart', capped }),
    costUsd: keyword.costUsd + (semantic?.costUsd ?? 0),
    searches: semantic ? 2 : 1,
  };
}
