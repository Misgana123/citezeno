import type { OpenAlexClient } from '../openalex/client';
import { keywordSearch } from './keyword';
import type { SearchMode, SearchRequest } from './request';
import { semanticSearch } from './semantic';
import { smartSearch } from './smart';
import type { PaperListResult } from './types';

const SEARCHES: Record<SearchMode, (client: OpenAlexClient, req: SearchRequest) => Promise<PaperListResult>> = {
  keyword: keywordSearch,
  semantic: semanticSearch,
  smart: smartSearch,
};

/* Picks the search for the request's mode. */
export function runSearch(client: OpenAlexClient, req: SearchRequest): Promise<PaperListResult> {
  return SEARCHES[req.mode](client, req);
}

/* How many searches a mode spends (for per-user limits): Smart runs two. */
export const searchesFor = (mode: SearchMode) => (mode === 'smart' ? 2 : 1);
