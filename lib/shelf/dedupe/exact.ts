import { toDoi, toWorkId } from '@/lib/papers/ids';
import type { Queryable } from '../db';

/* Exact duplicates: the user already has a paper with the same OpenAlex ID, or
   the same DOI (compared without case or the https://doi.org/ prefix). Returns
   the existing item's ID, or null. */
export async function findExactDuplicate(q: Queryable, userId: string, keys: { openalexId?: string | null; doi?: string | null }): Promise<string | null> {
  const openalexId = toWorkId(keys.openalexId);
  const doi = toDoi(keys.doi);
  if (!openalexId && !doi) return null;
  const { rows } = await q.query<{ id: string }>(
    `select i.id from shelf_item i join shelf_paper p on p.id = i."paperId"
     where i."userId" = $1 and ((p."openalexId" is not null and p."openalexId" = $2) or (p.doi is not null and p.doi = $3))
     order by (p."openalexId" = $2) desc nulls last limit 1`,
    [userId, openalexId, doi],
  );
  return rows[0]?.id ?? null;
}
