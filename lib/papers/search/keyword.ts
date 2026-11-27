import type { PaperSource } from '@/lib/providers/papers/types';
import { PER_PAGE, pageResult } from './page';
import type { SearchRequest } from './request';
import type { PaperListResult } from './types';

export const KEYWORD_PER_PAGE = PER_PAGE;

/* One page of keyword search. Every filter and sort works here. */
export async function keywordSearch(papers: PaperSource, req: SearchRequest, perPage = KEYWORD_PER_PAGE): Promise<PaperListResult> {
  const page = await papers.search({ text: req.query, filters: req.filters, sort: req.sort, page: req.page, perPage });
  return pageResult(page, req, { mode: 'keyword', searches: 1, perPage, searched: true });
}
