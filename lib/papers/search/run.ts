import type { OpenAlexClient } from '../openalex/client';
import { keywordSearch } from './keyword';
import type { SearchRequest } from './request';
import type { PaperListResult } from './types';

/* Picks the search for the request's mode.
   Semantic and Smart modes arrive in the next phase; until then they run keyword search
   (the returned list says mode "keyword"). */
export async function runSearch(client: OpenAlexClient, req: SearchRequest): Promise<PaperListResult> {
  return keywordSearch(client, req);
}
