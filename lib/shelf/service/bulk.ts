import type { BulkBody } from '../api/bodies';
import { tx, type Db } from '../db';
import { ShelfError } from '../errors';
import { deleteItems, ITEM_SELECT, setStatus, toItem } from '../store/items';
import { addTags, addToFolder, addToProject, moveItems, removeFromFolder, removeFromProject, removeTags } from '../store/links';
import { ownsProject } from '../store/projects';
import { findOrCreateTags } from '../store/tags';
import type { ShelfItem } from '../types';

/* One action on several shelf items, in one transaction. Items the user does
   not own are ignored by every store function, so they are simply skipped.
   Returns the changed items (or the IDs deleted) so the page can update. */

export type BulkResult = { items: ShelfItem[]; deleted: string[] };

export async function runBulk(db: Db, userId: string, body: BulkBody): Promise<BulkResult> {
  const ids = [...new Set(body.ids)];
  return tx(db, async (q) => {
    switch (body.action) {
      case 'delete':
        return { items: [], deleted: (await deleteItems(q, userId, ids)).deleted };
      case 'move':
        if (body.projectId && !body.folderId && !(await ownsProject(q, userId, body.projectId))) throw new ShelfError('not_found', 'That project no longer exists.');
        await moveItems(q, userId, ids, { projectId: body.projectId, folderId: body.folderId });
        break;
      case 'add_project':
        await addToProject(q, userId, ids, body.projectId);
        break;
      case 'remove_project':
        await removeFromProject(q, userId, ids, body.projectId);
        break;
      case 'add_folder':
        await addToFolder(q, userId, ids, body.folderId);
        break;
      case 'remove_folder':
        await removeFromFolder(q, userId, ids, body.folderId);
        break;
      case 'tag': {
        const named = await findOrCreateTags(q, userId, body.tagNames);
        await addTags(q, userId, ids, [...body.tagIds, ...named.map((t) => t.id)]);
        break;
      }
      case 'untag':
        await removeTags(q, userId, ids, body.tagIds);
        break;
      case 'status':
        await setStatus(q, userId, ids, body.status);
        break;
    }
    const { rows } = await q.query(`${ITEM_SELECT} where i."userId" = $1 and i.id = any($2)`, [userId, ids]);
    return { items: rows.map(toItem), deleted: [] };
  });
}
