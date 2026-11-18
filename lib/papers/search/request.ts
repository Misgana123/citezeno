import { z } from 'zod';
import { PapersError } from '../errors';
import { capText, DEFAULT_QUERY_CHARS } from './query-length';

/* The search request the browser sends, validated and normalized.
   Shared by the main search and the related-paper lists. */

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

export type SearchFilters = {
  yearFrom: number | null;
  yearTo: number | null;
  openAccess: boolean;
  types: WorkType[];
  language: string | null; // ISO 639-1, e.g. "en"
  hasAbstract: boolean;
  hideRetracted: boolean;
  minCitations: number | null;
};

export type SearchRequest = {
  query: string; // trimmed and capped at the configured search length
  truncated: boolean; // the user's text was longer than that
  mode: SearchMode;
  sort: SortKey;
  page: number;
  filters: SearchFilters;
};

export const DEFAULT_FILTERS: SearchFilters = {
  yearFrom: null,
  yearTo: null,
  openAccess: false,
  types: [],
  language: null,
  hasAbstract: false,
  hideRetracted: true,
  minCitations: null,
};

const maxYear = () => new Date().getUTCFullYear() + 1;
const flag = (fallback: boolean) =>
  z
    .enum(['1', '0', 'true', 'false'])
    .optional()
    .transform((v) => (v == null ? fallback : v === '1' || v === 'true'));
const year = z.coerce.number().int().min(MIN_YEAR).optional();

const schema = z
  .object({
    q: z.string().max(MAX_INPUT_CHARS, 'That text is too long.').optional().default(''),
    mode: z.enum(SEARCH_MODES).optional().default('smart'),
    sort: z.enum(SORTS).optional().default('relevance'),
    page: z.coerce.number().int().min(1).max(MAX_PAGE).optional().default(1),
    from: year,
    to: year,
    oa: flag(false),
    type: z.array(z.enum(WORK_TYPES)).max(WORK_TYPES.length).optional().default([]),
    lang: z
      .string()
      .regex(/^[a-z]{2}$/i, 'Unknown language.')
      .optional(),
    abstract: flag(false),
    retracted: flag(false), // "show retracted"; hidden by default
    minCites: z.coerce.number().int().min(0).max(1_000_000).optional(),
  })
  .refine((v) => v.from == null || v.from <= maxYear(), { message: 'Check the "from" year.', path: ['from'] })
  .refine((v) => v.to == null || v.to <= maxYear(), { message: 'Check the "to" year.', path: ['to'] })
  .refine((v) => v.from == null || v.to == null || v.from <= v.to, { message: 'The "from" year is after the "to" year.', path: ['from'] });

/* Search params → SearchRequest. `requireQuery` is false for related lists,
   which are driven by a paper ID instead of text. */
export function parseSearchRequest(
  params: URLSearchParams,
  { requireQuery = true, maxQueryChars = DEFAULT_QUERY_CHARS }: { requireQuery?: boolean; maxQueryChars?: number } = {},
): SearchRequest {
  const raw: Record<string, unknown> = {};
  for (const key of ['q', 'mode', 'sort', 'page', 'from', 'to', 'oa', 'lang', 'abstract', 'retracted', 'minCites']) {
    const v = params.get(key);
    if (v != null && v.trim() !== '') raw[key] = v.trim();
  }
  const types = params.getAll('type').flatMap((t) => t.split(',')).map((t) => t.trim()).filter(Boolean);
  if (types.length) raw.type = [...new Set(types)];

  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new PapersError('bad_request', parsed.error.issues[0]?.message || 'Check the search settings.');
  const v = parsed.data;

  const full = v.q.replace(/\s+/g, ' ').trim();
  if (requireQuery && !full) throw new PapersError('bad_request', 'Type a topic, question or paragraph to search.');

  return {
    query: capText(full, maxQueryChars),
    truncated: full.length > maxQueryChars,
    mode: v.mode,
    sort: v.sort,
    page: v.page,
    filters: {
      yearFrom: v.from ?? null,
      yearTo: v.to ?? null,
      openAccess: v.oa,
      types: v.type,
      language: v.lang?.toLowerCase() ?? null,
      hasAbstract: v.abstract,
      hideRetracted: !v.retracted,
      minCitations: v.minCites ? v.minCites : null,
    },
  };
}
