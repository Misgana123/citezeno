import type { ReadingStatus } from '../types';

/* Builds the WHERE / ORDER BY of a shelf listing. Every value goes in as a
   parameter; only fixed SQL fragments are concatenated. The first parameter is
   always the user's ID, so a listing can never reach another user's items.
   Tables are aliased i (shelf_item) and p (shelf_paper). */

export const LIST_SORTS = ['added_desc', 'added_asc', 'year_desc', 'year_asc', 'title', 'cited'] as const;
export type ListSort = (typeof LIST_SORTS)[number];

export type ListQuery = {
  /* a project ID, or "unsorted" for items in no project */
  project?: string;
  folder?: string;
  tag?: string;
  status?: ReadingStatus;
  yearFrom?: number;
  yearTo?: number;
  openAccess?: boolean;
  retracted?: boolean;
  sort: ListSort;
  page: number;
  perPage: number;
};

export const UNSORTED = 'unsorted';

const ORDER: Record<ListSort, string> = {
  added_desc: `i."addedAt" desc, i.id`,
  added_asc: `i."addedAt" asc, i.id`,
  year_desc: `p.year desc nulls last, i."addedAt" desc, i.id`,
  year_asc: `p.year asc nulls last, i."addedAt" desc, i.id`,
  title: `lower(p.title) asc, i.id`,
  cited: `p."citedByCount" desc, i."addedAt" desc, i.id`,
};

export type BuiltQuery = { where: string; values: unknown[]; orderBy: string; limit: number; offset: number };

export function buildListQuery(userId: string, query: ListQuery): BuiltQuery {
  const values: unknown[] = [userId];
  const where = [`i."userId" = $1`];
  const param = (v: unknown) => {
    values.push(v);
    return `$${values.length}`;
  };

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

  const perPage = Math.min(100, Math.max(1, Math.floor(query.perPage)));
  const page = Math.max(1, Math.floor(query.page));
  return { where: where.join(' and '), values, orderBy: ORDER[query.sort] ?? ORDER.added_desc, limit: perPage, offset: (page - 1) * perPage };
}
