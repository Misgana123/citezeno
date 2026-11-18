/* Search options shared by the server (validation) and the browser (the form).
   No imports: safe for client components. */

export const SEARCH_MODES = ['smart', 'keyword', 'semantic'] as const;
export const SORTS = ['relevance', 'newest', 'cited'] as const;
export const WORK_TYPES = [
  'article',
  'book',
  'book-chapter',
  'preprint',
  'dataset',
  'dissertation',
  'review',
  'report',
  'editorial',
  'letter',
  'standard',
  'other',
] as const;

export type SearchMode = (typeof SEARCH_MODES)[number];
export type SortKey = (typeof SORTS)[number];
export type WorkType = (typeof WORK_TYPES)[number];

export const MAX_INPUT_CHARS = 10_000; // longer input is rejected outright
export const MAX_PAGE = 100;
export const MIN_YEAR = 1000;
