import { z } from 'zod';
import { PapersError } from '../errors';
import { MIN_YEAR, WORK_TYPES, type WorkType } from '../search/options';

/* The Explore feed's request: a subject, sort, filters and page, validated and
   normalized. Shared by the feed and its filter counts. */

export const EXPLORE_SORTS = ['trending', 'cited', 'newest', 'free'] as const;
export type ExploreSort = (typeof EXPLORE_SORTS)[number];

/* The citation bands offered as filters. */
export const CITE_BANDS = [10, 100, 1000] as const;

export const EXPLORE_PER_PAGE = 24;
export const EXPLORE_MAX_PAGE = 200;

export type ExploreQuery = {
  subject: string | null;
  sort: ExploreSort;
  types: WorkType[];
  sources: string[];
  yearFrom: number | null;
  yearTo: number | null;
  openAccess: boolean;
  hasPdf: boolean;
  hasAbstract: boolean;
  minCitations: number | null;
  language: string | null;
  page: number;
};

const flag = z
  .enum(['1', '0', 'true', 'false'])
  .optional()
  .transform((v) => v === '1' || v === 'true');
const year = z.coerce.number().int().min(MIN_YEAR).max(3000).optional();

const schema = z.object({
  subject: z.string().max(80).optional(),
  sort: z.enum(EXPLORE_SORTS).optional().default('trending'),
  type: z.array(z.enum(WORK_TYPES)).max(WORK_TYPES.length).optional().default([]),
  source: z
    .array(z.string().regex(/^[a-z][a-z0-9-]{0,31}$/))
    .max(12)
    .optional()
    .default([]),
  from: year,
  to: year,
  oa: flag,
  pdf: flag,
  abstract: flag,
  minCites: z.coerce.number().int().min(0).max(1_000_000).optional(),
  lang: z
    .string()
    .regex(/^[a-z]{2}$/i)
    .optional(),
  page: z.coerce.number().int().min(1).max(EXPLORE_MAX_PAGE).optional().default(1),
});

const list = (p: URLSearchParams, key: string) => [...new Set(p.getAll(key).flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean))];

export function parseExploreQuery(p: URLSearchParams): ExploreQuery {
  const raw: Record<string, unknown> = { type: list(p, 'type'), source: list(p, 'source') };
  for (const key of ['subject', 'sort', 'from', 'to', 'oa', 'pdf', 'abstract', 'minCites', 'lang', 'page']) {
    const v = p.get(key);
    if (v != null && v.trim() !== '') raw[key] = v.trim();
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new PapersError('bad_request', parsed.error.issues[0]?.message || 'Check the filters.');
  const v = parsed.data;
  const [from, to] = v.from != null && v.to != null && v.from > v.to ? [v.to, v.from] : [v.from, v.to];
  return {
    subject: v.subject?.trim() || null,
    sort: v.sort,
    types: v.type,
    sources: v.source,
    yearFrom: from ?? null,
    yearTo: to ?? null,
    openAccess: v.oa,
    hasPdf: v.pdf,
    hasAbstract: v.abstract,
    minCitations: v.minCites ? v.minCites : null,
    language: v.lang?.toLowerCase() ?? null,
    page: v.page,
  };
}

/* The counts key: the query without its page (every page shares one set of counts). */
export const facetsKey = (q: ExploreQuery) => JSON.stringify({ ...q, page: 1 });
