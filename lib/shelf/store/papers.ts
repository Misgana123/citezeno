import { randomUUID } from 'node:crypto';
import type { Paper } from '@/lib/papers/types';
import type { Queryable } from '../db';
import type { PaperOrigin, ShelfPaper } from '../types';

/* Paper records (shelf_paper). OpenAlex papers are shared: their ID is the
   OpenAlex work ID and anyone saving the same paper reuses the record. Manual
   and unmatched imported papers are private: a "p_" ID and an owner. */

export type PaperRow = {
  id: string;
  ownerId: string | null;
  openalexId: string | null;
  doi: string | null;
  origin: PaperOrigin;
  data: Omit<Paper, 'id' | 'openalexId' | 'doi'>;
};

/* The paper columns a query must select (aliased "p"). */
export const PAPER_COLUMNS = `p.id as "p_id", p."ownerId" as "p_ownerId", p."openalexId" as "p_openalexId", p.doi as "p_doi", p.origin as "p_origin", p.data as "p_data"`;

export function toShelfPaper(r: PaperRow): ShelfPaper {
  const { id: _i, openalexId: _o, doi: _d, ...data } = r.data as Paper;
  return { ...data, id: r.id, openalexId: r.openalexId, doi: r.doi, origin: r.origin };
}

/* A row selected with PAPER_COLUMNS → ShelfPaper. */
export const paperFromPrefixed = (r: Record<string, unknown>): ShelfPaper =>
  toShelfPaper({
    id: r.p_id as string,
    ownerId: r.p_ownerId as string | null,
    openalexId: r.p_openalexId as string | null,
    doi: r.p_doi as string | null,
    origin: r.p_origin as PaperOrigin,
    data: r.p_data as PaperRow['data'],
  });

export const isPrivateId = (id: string) => id.startsWith('p_');

type Details = Omit<Paper, 'id' | 'openalexId'>;

function stored(p: Details) {
  // the IDs and DOI live in their own columns
  const { id: _id, openalexId: _oa, doi, ...rest } = p as Paper;
  return {
    doi: doi ?? null,
    title: p.title,
    year: p.year,
    citedByCount: Math.max(0, Math.floor(p.citedByCount || 0)),
    isOpenAccess: !!p.isOpenAccess,
    isRetracted: !!p.isRetracted,
    data: JSON.stringify(rest),
  };
}

const SELECT = `select id, "ownerId", "openalexId", doi, origin, data from shelf_paper`;

/* Save fresh OpenAlex details for a shared paper, replacing what was there. */
export async function putShared(q: Queryable, paper: Paper): Promise<ShelfPaper> {
  const s = stored(paper);
  const { rows } = await q.query<PaperRow>(
    `insert into shelf_paper (id, "ownerId", "openalexId", doi, title, year, "citedByCount", "isOpenAccess", "isRetracted", origin, data, "refreshDue")
     values ($1, null, $1, $2, $3, $4, $5, $6, $7, 'openalex', $8, false)
     on conflict (id) do update set doi = excluded.doi, title = excluded.title, year = excluded.year, "citedByCount" = excluded."citedByCount",
       "isOpenAccess" = excluded."isOpenAccess", "isRetracted" = excluded."isRetracted", data = excluded.data, "refreshDue" = false, "updatedAt" = now()
     returning id, "ownerId", "openalexId", doi, origin, data`,
    [paper.openalexId, s.doi, s.title, s.year, s.citedByCount, s.isOpenAccess, s.isRetracted, s.data],
  );
  return toShelfPaper(rows[0]);
}

/* Keep a shared paper whose details could not be confirmed with OpenAlex right
   now: added only if no record exists yet, and marked to be refreshed later.
   An existing record is never overwritten by unconfirmed details. */
export async function ensureShared(q: Queryable, paper: Paper): Promise<ShelfPaper> {
  const s = stored(paper);
  await q.query(
    `insert into shelf_paper (id, "ownerId", "openalexId", doi, title, year, "citedByCount", "isOpenAccess", "isRetracted", origin, data, "refreshDue")
     values ($1, null, $1, $2, $3, $4, $5, $6, $7, 'openalex', $8, true)
     on conflict (id) do nothing`,
    [paper.openalexId, s.doi, s.title, s.year, s.citedByCount, s.isOpenAccess, s.isRetracted, s.data],
  );
  return (await getPaper(q, paper.openalexId)) as ShelfPaper;
}

/* A paper only ownerId can see: added by hand, or imported without an OpenAlex match. */
export async function createPrivate(q: Queryable, ownerId: string, paper: Details, origin: Exclude<PaperOrigin, 'openalex'>): Promise<ShelfPaper> {
  const s = stored(paper);
  const { rows } = await q.query<PaperRow>(
    `insert into shelf_paper (id, "ownerId", "openalexId", doi, title, year, "citedByCount", "isOpenAccess", "isRetracted", origin, data)
     values ($1, $2, null, $3, $4, $5, $6, $7, $8, $9, $10)
     returning id, "ownerId", "openalexId", doi, origin, data`,
    [`p_${randomUUID()}`, ownerId, s.doi, s.title, s.year, s.citedByCount, s.isOpenAccess, s.isRetracted, origin, s.data],
  );
  return toShelfPaper(rows[0]);
}

/* Replace the details of a private paper (only its owner may). */
export async function updatePrivate(q: Queryable, ownerId: string, id: string, paper: Details): Promise<ShelfPaper | null> {
  const s = stored(paper);
  const { rows } = await q.query<PaperRow>(
    `update shelf_paper set doi = $3, title = $4, year = $5, "citedByCount" = $6, "isOpenAccess" = $7, "isRetracted" = $8, data = $9, "updatedAt" = now()
     where id = $1 and "ownerId" = $2
     returning id, "ownerId", "openalexId", doi, origin, data`,
    [id, ownerId, s.doi, s.title, s.year, s.citedByCount, s.isOpenAccess, s.isRetracted, s.data],
  );
  return rows[0] ? toShelfPaper(rows[0]) : null;
}

export async function getPaper(q: Queryable, id: string): Promise<ShelfPaper | null> {
  const { rows } = await q.query<PaperRow>(`${SELECT} where id = $1`, [id]);
  return rows[0] ? toShelfPaper(rows[0]) : null;
}

/* Shared records among these OpenAlex IDs. */
export async function getShared(q: Queryable, openalexIds: string[]): Promise<ShelfPaper[]> {
  if (!openalexIds.length) return [];
  const { rows } = await q.query<PaperRow>(`${SELECT} where "ownerId" is null and id = any($1)`, [openalexIds]);
  return rows.map(toShelfPaper);
}

/* Private records left without a shelf item are removed; shared records are always kept. */
export async function deleteOrphanedPrivate(q: Queryable, ids: string[]): Promise<void> {
  const own = ids.filter(isPrivateId);
  if (!own.length) return;
  await q.query(`delete from shelf_paper p where p.id = any($1) and p."ownerId" is not null and not exists (select 1 from shelf_item i where i."paperId" = p.id)`, [own]);
}
