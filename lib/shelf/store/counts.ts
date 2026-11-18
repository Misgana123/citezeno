import type { Queryable } from '../db';

/* Totals for the sidebar: all papers, papers in no project, and retracted ones. */
export type ShelfCounts = { all: number; unsorted: number; retracted: number };

export async function shelfCounts(q: Queryable, userId: string): Promise<ShelfCounts> {
  const { rows } = await q.query<{ all: string; unsorted: string; retracted: string }>(
    `select count(*) as all,
       count(*) filter (where not exists (select 1 from shelf_item_project ip where ip."itemId" = i.id)) as unsorted,
       count(*) filter (where p."isRetracted") as retracted
     from shelf_item i join shelf_paper p on p.id = i."paperId" where i."userId" = $1`,
    [userId],
  );
  return { all: Number(rows[0].all), unsorted: Number(rows[0].unsorted), retracted: Number(rows[0].retracted) };
}
