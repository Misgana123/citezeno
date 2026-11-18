import { toPapers } from '../mapper';
import type { OpenAlexClient } from '../openalex/client';
import { CARD_FIELDS, selectParam } from '../openalex/fields';
import type { OpenAlexList } from '../openalex/types';
import { buildFilter, sortParam } from './filters';
import type { SearchMode, SearchRequest } from './request';
import type { PaperListResult, SearchNotice } from './types';

export const PER_PAGE = 25;

/* One page of `/works` where OpenAlex does the filtering, sorting and paging:
   keyword search (`search`) and the related lists (`cites:` / `cited_by:`). */
export async function worksPage(
  client: OpenAlexClient,
  req: SearchRequest,
  opts: { search?: string; extraFilters?: string[]; mode: SearchMode; searches: number; perPage?: number },
): Promise<PaperListResult> {
  const perPage = opts.perPage ?? PER_PAGE;
  const { body, costUsd } = await client.get<OpenAlexList>('/works', {
    search: opts.search,
    filter: buildFilter(req.filters, 'keyword', opts.extraFilters) || undefined,
    sort: sortParam(req.sort),
    page: req.page,
    per_page: perPage,
    select: selectParam(CARD_FIELDS),
  });
  const papers = toPapers(body.results);
  const total = Math.max(0, Number(body.meta?.count) || 0);
  const notices: SearchNotice[] = opts.search != null && req.truncated ? ['query_truncated'] : [];
  return {
    list: { papers, total, page: req.page, perPage, hasMore: req.page * perPage < total, mode: opts.mode, sort: req.sort, notices },
    costUsd,
    searches: opts.searches,
  };
}
