import type { PaperPage } from '@/lib/providers/papers/types';
import type { SearchMode, SearchRequest } from './request';
import type { PaperListResult, SearchNotice } from './types';

export const PER_PAGE = 25;

/* One page the provider filtered, sorted and paged (keyword search and the
   related lists) → the list the browser gets. */
export function pageResult(
  page: PaperPage,
  req: SearchRequest,
  opts: { mode: SearchMode; searches: number; perPage: number; searched: boolean },
): PaperListResult {
  const notices: SearchNotice[] = opts.searched && req.truncated ? ['query_truncated'] : [];
  return {
    list: {
      papers: page.papers,
      total: page.total,
      page: req.page,
      perPage: opts.perPage,
      hasMore: req.page * opts.perPage < page.total,
      mode: opts.mode,
      sort: req.sort,
      notices,
    },
    costUsd: page.costUsd,
    searches: opts.searches,
  };
}
