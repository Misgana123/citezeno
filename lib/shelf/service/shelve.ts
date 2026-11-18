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
