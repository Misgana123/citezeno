import { z } from 'zod';
import { ShelfError } from '../errors';
import { LIST_SORTS, type ListQuery } from '../store/list-query';
import { READING_STATUSES } from '../types';

/* A shelf listing request from the query string, validated. */

const id = z.string().trim().min(1).max(80);
const flag = z.enum(['1', '0', 'true', 'false']).optional().transform((v) => (v == null ? undefined : v === '1' || v === 'true'));
const year = z.coerce.number().int().min(1000).max(3000).optional();

const schema = z.object({
  q: z.string().trim().max(500, 'That search is too long.').optional(),
  project: id.optional(),
  folder: id.optional(),
  tag: id.optional(),
  status: z.enum(READING_STATUSES).optional(),
  from: year,
  to: year,
  oa: flag,
  retracted: flag,
  pdf: flag,
  sort: z.enum(LIST_SORTS).optional().default('added_desc'),
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  perPage: z.coerce.number().int().min(1).max(100).optional().default(25),
});

export type ListRequest = ListQuery & { q?: string; hasPdf?: boolean };

export function parseListRequest(params: URLSearchParams): ListRequest {
  const raw: Record<string, string> = {};
  for (const [k, v] of params) if (v !== '') raw[k] = v;
  const r = schema.safeParse(raw);
  if (!r.success) throw new ShelfError('bad_request', r.error.issues[0]?.message || 'Check the filters.');
  const v = r.data;
  return {
    q: v.q || undefined,
    project: v.project,
    folder: v.folder,
    tag: v.tag,
    status: v.status,
    yearFrom: v.from,
    yearTo: v.to,
    openAccess: v.oa,
    retracted: v.retracted,
    hasPdf: v.pdf,
    sort: v.sort,
    page: v.page,
    perPage: v.perPage,
  };
}
