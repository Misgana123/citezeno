import { tx, type Db, type Queryable } from '../db';
import { findExactDuplicate } from '../dedupe/exact';
import { ShelfError } from '../errors';
import { addItem, getItem } from '../store/items';
import { addToProject } from '../store/links';
import { ownsProject } from '../store/projects';
import type { AddedVia, ShelfItem, ShelfPaper } from '../types';

/* The last step of every way a paper reaches the shelf: refuse exact
   duplicates, create the paper record if needed, add the item and put it in
   the chosen project, all in one transaction. */

export const alreadySaved = (itemId: string) => new ShelfError('duplicate', 'Already on your shelf.', { itemId });

export async function shelve(
  db: Db,
  userId: string,
  opts: {
    keys: { openalexId?: string | null; doi?: string | null };
    paper: (q: Queryable) => Promise<ShelfPaper>;
    via: AddedVia;
    projectId?: string | null;
  },
): Promise<ShelfItem> {
  return tx(db, async (q) => {
    const dup = await findExactDuplicate(q, userId, opts.keys);
    if (dup) throw alreadySaved(dup);
    if (opts.projectId && !(await ownsProject(q, userId, opts.projectId))) throw new ShelfError('not_found', 'That project no longer exists.');
    const paper = await opts.paper(q);
    const { item, created } = await addItem(q, userId, paper.id, opts.via);
    if (!created) throw alreadySaved(item.id);
    if (opts.projectId) await addToProject(q, userId, [item.id], opts.projectId);
    return (await getItem(q, userId, item.id)) as ShelfItem;
  });
}

/* The same steps with fewer round trips, for imports, inside the caller's
   transaction: the project is checked by the insert itself, and only the new
   item's ID comes back. */
export async function shelveLean(
  q: Queryable,
  userId: string,
  opts: { keys: { openalexId?: string | null; doi?: string | null }; paper: (q: Queryable) => Promise<{ id: string }>; via: AddedVia; projectId?: string | null },
): Promise<string> {
  {
    const dup = await findExactDuplicate(q, userId, opts.keys);
    if (dup) throw alreadySaved(dup);
    const paper = await opts.paper(q);
    const { rows } = await q.query<{ id: string }>(
      `insert into shelf_item (id, "userId", "paperId", "addedVia") values ('i_' || gen_random_uuid()::text, $1, $2, $3)
       on conflict ("userId", "paperId") do nothing returning id`,
      [userId, paper.id, opts.via],
    );
    if (!rows[0]) {
      const existing = await q.query<{ id: string }>(`select id from shelf_item where "userId" = $1 and "paperId" = $2`, [userId, paper.id]);
      throw alreadySaved(existing.rows[0]?.id ?? '');
    }
    if (opts.projectId) {
      const { rowCount } = await q.query(
        `insert into shelf_item_project ("itemId", "projectId") select $1, id from shelf_project where id = $2 and "userId" = $3`,
        [rows[0].id, opts.projectId, userId],
      );
      if (!rowCount) throw new ShelfError('not_found', 'That project no longer exists.');
    }
    return rows[0].id;
  }
}
