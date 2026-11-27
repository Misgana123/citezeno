import type { Paper } from '../types';
import type { SearchMode, SortKey } from './options';

/* Notes the UI shows above the results. */
export type SearchNotice = 'query_truncated' | 'filtered_top_results' | 'results_capped' | 'partial_results';

/* What a search or related list returns to the browser. */
export type PaperList = {
  papers: Paper[];
  total: number; // matches found (for semantic: at most the 50 it returns)
  page: number;
  perPage: number;
  hasMore: boolean;
  mode: SearchMode;
  sort: SortKey;
  notices: SearchNotice[];
};

/* A list plus what it cost; the cost is logged on the server, never sent. */
export type PaperListResult = { list: PaperList; costUsd: number; searches: number };
