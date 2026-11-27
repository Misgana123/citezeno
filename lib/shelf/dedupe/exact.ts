import { splitPaperId, toDoi } from '@/lib/papers/ids';
import type { Queryable } from '../db';

/* Exact duplicates: the user already has the same paper record (the same
   Citezeno paper ID), or a paper with the same DOI (compared without case or
   the https://doi.org/ prefix), whichever provider it came from. Returns the
   existing item's ID, or null. */
export async function findExactDuplicate(q: Queryable, userId: string, keys: { paperId?: string | null; doi?: string | null }): Promise<string | null> {
  const paperId = splitPaperId(keys.paperId) ? (keys.paperId as string) : null;
  const doi = toDoi(keys.doi);
  if (!paperId && !doi) return null;
  const { rows } = await q.query<{ id: string }>(
    `select i.id from shelf_item i join shelf_paper p on p.id = i."paperId"
     where i."userId" = $1 and (i."paperId" = $2 or (p.doi is not null and p.doi = $3))
     order by (i."paperId" = $2) desc nulls last limit 1`,
    [userId, paperId, doi],
  );
  return rows[0]?.id ?? null;
}
