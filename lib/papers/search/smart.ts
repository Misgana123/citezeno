import { toPapers } from '../mapper';
import type { OpenAlexClient } from '../openalex/client';
import { CARD_FIELDS, selectParam } from '../openalex/fields';
import type { OpenAlexList } from '../openalex/types';
import { buildFilter } from './filters';
import { fuseRanked } from './fuse';
import type { SearchFilters, SearchRequest } from './request';
import { listFromPool, SEMANTIC_MAX, semanticPool, type Pool } from './semantic';
import type { PaperListResult } from './types';

/* Smart mode: keyword and semantic search side by side (OpenAlex allows one
   search type per request), merged with Reciprocal Rank Fusion on our server.
   Costs two searches. */

export const SMART_KEYWORD_POOL = 50;

/* The top keyword results by relevance, with every filter. */
export async function keywordPool(client: OpenAlexClient, query: string, filters: SearchFilters): Promise<Pool & { total: number }> {
  const { body, costUsd } = await client.get<OpenAlexList>('/works', {
    search: query,
    filter: buildFilter(filters, 'keyword') || undefined,
    per_page: SMART_KEYWORD_POOL,
    select: selectParam(CARD_FIELDS),
  });
  return { papers: toPapers(body.results), total: Math.max(0, Number(body.meta?.count) || 0), costUsd };
}

export async function smartSearch(client: OpenAlexClient, req: SearchRequest): Promise<PaperListResult> {
  const [keyword, semantic] = await Promise.all([keywordPool(client, req.query, req.filters), semanticPool(client, req.query, req.filters)]);
  const merged = fuseRanked([keyword.papers, semantic.papers]);
  const capped = keyword.total > keyword.papers.length || semantic.papers.length >= SEMANTIC_MAX;
  return {
    list: listFromPool(merged, req, { mode: 'smart', capped }),
    costUsd: keyword.costUsd + semantic.costUsd,
    searches: 2,
  };
}
