import { toPapers } from '../mapper';
import type { OpenAlexClient } from '../openalex/client';
import { CARD_FIELDS, selectParam } from '../openalex/fields';
import type { OpenAlexList } from '../openalex/types';
import { buildFilter, sortParam } from './filters';
import type { SearchRequest } from './request';
import type { PaperListResult, SearchNotice } from './types';

export const KEYWORD_PER_PAGE = 25;

/* One page of keyword search (`/works?search=`). Every filter and sort works here. */
export async function keywordSearch(client: OpenAlexClient, req: SearchRequest, perPage = KEYWORD_PER_PAGE): Promise<PaperListResult> {
  const { body, costUsd } = await client.get<OpenAlexList>('/works', {
    search: req.query,
    filter: buildFilter(req.filters, 'keyword') || undefined,
    sort: sortParam(req.sort),
    page: req.page,
    per_page: perPage,
    select: selectParam(CARD_FIELDS),
  });
  const papers = toPapers(body.results);
  const total = Math.max(0, Number(body.meta?.count) || 0);
  const notices: SearchNotice[] = req.truncated ? ['query_truncated'] : [];
  return {
    list: { papers, total, page: req.page, perPage, hasMore: req.page * perPage < total, mode: 'keyword', sort: req.sort, notices },
    costUsd,
    searches: 1,
  };
}
