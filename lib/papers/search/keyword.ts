import type { OpenAlexClient } from '../openalex/client';
import { PER_PAGE, worksPage } from './page';
import type { SearchRequest } from './request';
import type { PaperListResult } from './types';

export const KEYWORD_PER_PAGE = PER_PAGE;

/* One page of keyword search (`/works?search=`). Every filter and sort works here. */
export function keywordSearch(client: OpenAlexClient, req: SearchRequest, perPage = KEYWORD_PER_PAGE): Promise<PaperListResult> {
  return worksPage(client, req, { search: req.query, mode: 'keyword', searches: 1, perPage });
}
