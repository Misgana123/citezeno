import { PapersError } from '../errors';
import type { PaperSources } from '@/lib/providers/papers/sources';
import { keywordAcross } from './across';
import type { SearchMode, SearchRequest } from './request';
import { semanticSearch } from './semantic';
import { smartSearch } from './smart';
import type { PaperListResult } from './types';

const SEARCHES: Record<SearchMode, (sources: PaperSources, req: SearchRequest) => Promise<PaperListResult>> = {
  keyword: keywordAcross,
  semantic: async (sources, req) => {
    const meaning = sources.withCapability('semantic_search');
    if (!meaning) throw new PapersError('bad_request', 'Search by meaning isn’t available right now. Try a keyword search.');
    return semanticSearch(meaning, req);
  },
  smart: smartSearch,
};

/* Picks the search for the request's mode. */
export function runSearch(sources: PaperSources, req: SearchRequest): Promise<PaperListResult> {
  return SEARCHES[req.mode](sources, req);
}

/* How many searches a mode may spend (for per-user limits): Smart runs two.
   Searches not run are given back afterwards. */
export const searchesFor = (mode: SearchMode) => (mode === 'smart' ? 2 : 1);
