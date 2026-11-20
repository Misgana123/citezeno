import type { ReadingStatus } from '../types';

/* Builds the WHERE / ORDER BY of a shelf listing. Every value goes in as a
   parameter; only fixed SQL fragments are concatenated. The first parameter is
   always the user's ID, so a listing can never reach another user's items.
   Tables are aliased i (shelf_item) and p (shelf_paper). */

export const LIST_SORTS = ['relevance', 'added_desc', 'added_asc', 'year_desc', 'year_asc', 'title', 'cited'] as const;
export type ListSort = (typeof LIST_SORTS)[number];

export type ListQuery = {
  /* words to search for in the details, tags, note, PDF text, and the reader's highlights and notes */
  q?: string;
  /* only these items (for exporting a selection) */
  ids?: string[];
  /* a project ID, or "unsorted" for items in no project */
  project?: string;
  folder?: string;
  tag?: string;
  status?: ReadingStatus;
  yearFrom?: number;
  yearTo?: number;
  openAccess?: boolean;
  retracted?: boolean;
  hasPdf?: boolean;
  sort: ListSort;
  page: number;
  perPage: number;
};

export const UNSORTED = 'unsorted';

const ORDER: Record<Exclude<ListSort, 'relevance'>, string> = {
  added_desc: `i."addedAt" desc, i.id`,
  added_asc: `i."addedAt" asc, i.id`,
  year_desc: `p.year desc nulls last, i."addedAt" desc, i.id`,
  year_asc: `p.year asc nulls last, i."addedAt" desc, i.id`,
  title: `lower(p.title) asc, i.id`,
  cited: `p."citedByCount" desc, i."addedAt" desc, i.id`,
};

/* Search words → a prefix query: every word must match the start of a word
   ("flood" finds "floods"). Only letters and digits get through, so the
   user's text can never be read as query syntax. */
export function toPrefixQuery(q: string | undefined): string | null {
  const words = (q ?? '').normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu)?.slice(0, 12) ?? [];
  return words.length ? words.map((w) => `${w}:*`).join(' & ') : null;
}

export type BuiltQuery = { where: string; values: unknown[]; orderBy: string; limit: number; offset: number };

export function buildListQuery(userId: string, query: ListQuery): BuiltQuery {
  const values: unknown[] = [userId];
  const where = [`i."userId" = $1`];
  const param = (v: unknown) => {
    values.push(v);
    return `$${values.length}`;
  };

  const tsq = toPrefixQuery(query.q);
  let relevance: string | null = null;
  if (tsq) {
    const Q = `to_tsquery('simple', ${param(tsq)})`;
    where.push(`(p.tsv @@ ${Q} or i.tsv @@ ${Q}
      or exists (select 1 from shelf_item_tag x join shelf_tag t on t.id = x."tagId" where x."itemId" = i.id and to_tsvector('simple', t.name) @@ ${Q})
      or exists (select 1 from shelf_pdf f where f."itemId" = i.id and f.tsv @@ ${Q})
      or exists (select 1 from reader_highlight h where h."userId" = i."userId" and h."paperId" = i."paperId" and to_tsvector('simple', h.quote || ' ' || coalesce(h.note, '')) @@ ${Q})
      or exists (select 1 from reader_page_note n where n."userId" = i."userId" and n."paperId" = i."paperId" and to_tsvector('simple', n.text) @@ ${Q}))`);
    relevance = `ts_rank(p.tsv, ${Q}) + ts_rank(i.tsv, ${Q}) + 0.5 * coalesce((select max(ts_rank(f.tsv, ${Q})) from shelf_pdf f where f."itemId" = i.id), 0) desc, i."addedAt" desc, i.id`;
  }
  if (query.ids) where.push(`i.id = any(${param(query.ids)})`);
  if (query.project === UNSORTED) {
    where.push(`not exists (select 1 from shelf_item_project ip where ip."itemId" = i.id)`);
  } else if (query.project) {
    where.push(`exists (select 1 from shelf_item_project ip where ip."itemId" = i.id and ip."projectId" = ${param(query.project)})`);
  }
  if (query.folder) where.push(`exists (select 1 from shelf_item_folder f where f."itemId" = i.id and f."folderId" = ${param(query.folder)})`);
  if (query.tag) where.push(`exists (select 1 from shelf_item_tag t where t."itemId" = i.id and t."tagId" = ${param(query.tag)})`);
  if (query.status) where.push(`i."readingStatus" = ${param(query.status)}`);
  if (query.yearFrom != null) where.push(`p.year >= ${param(query.yearFrom)}`);
  if (query.yearTo != null) where.push(`p.year <= ${param(query.yearTo)}`);
  if (query.openAccess != null) where.push(`p."isOpenAccess" = ${param(query.openAccess)}`);
  if (query.retracted != null) where.push(`p."isRetracted" = ${param(query.retracted)}`);
  if (query.hasPdf != null) where.push(`${query.hasPdf ? '' : 'not '}exists (select 1 from shelf_pdf f where f."itemId" = i.id and f.status = 'ready')`);

  const perPage = Math.min(100, Math.max(1, Math.floor(query.perPage)));
  const page = Math.max(1, Math.floor(query.page));
    const orderBy = query.sort === 'relevance' ? (relevance ?? ORDER.added_desc) : (ORDER[query.sort] ?? ORDER.added_desc);
  return { where: where.join(' and '), values, orderBy, limit: perPage, offset: (page - 1) * perPage };
}
