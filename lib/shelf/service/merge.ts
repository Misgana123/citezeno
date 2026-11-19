import { tx, type Db } from '../db';
import { completeness, fillDetails, furtherStatus, joinNotes } from '../dedupe/merge-details';
import { ShelfError } from '../errors';
import { deleteItems, getItem } from '../store/items';
import { updatePrivate } from '../store/papers';
import { movePdfs } from '../store/pdfs';
import type { ShelfItem } from '../types';

/* Merge two shelf items that are the same paper. The one with the more
   complete details stays (an OpenAlex record always wins; two private records
   are combined field by field). Every project, folder, tag, note and PDF from
   both ends up on the one that stays; the other is removed. */

export type MergeResult = { item: ShelfItem; removedId: string };

export async function mergeItems(db: Db, userId: string, x: string, y: string): Promise<MergeResult> {
  if (x === y) throw new ShelfError('bad_request', 'Pick two different papers to merge.');
  return tx(db, async (q) => {
    const a = await getItem(q, userId, x);
    const b = await getItem(q, userId, y);
    if (!a || !b) throw new ShelfError('not_found', 'One of these papers is no longer on your shelf.');
    const [keep, drop] = completeness(b.paper) > completeness(a.paper) ? [b, a] : [a, b];

    if (keep.paper.origin !== 'provider' && drop.paper.origin !== 'provider' && keep.paper.id !== drop.paper.id) {
      const { id: _id, provider: _pr, origin: _o, ...details } = fillDetails(keep.paper, drop.paper);
      await updatePrivate(q, userId, keep.paper.id, details);
    }

    for (const [table, col] of [
      ['shelf_item_project', '"projectId"'],
      ['shelf_item_folder', '"folderId"'],
      ['shelf_item_tag', '"tagId"'],
    ]) {
      await q.query(`insert into ${table} ("itemId", ${col}) select $1, ${col} from ${table} where "itemId" = $2 on conflict do nothing`, [keep.id, drop.id]);
    }

    await movePdfs(q, userId, drop.id, keep.id);
    await q.query(
      `update shelf_item set note = $3, "readingStatus" = $4, "addedAt" = least("addedAt", $5::timestamptz), "updatedAt" = now() where "userId" = $1 and id = $2`,
      [userId, keep.id, joinNotes(keep.note, drop.note), furtherStatus(keep.readingStatus, drop.readingStatus), drop.addedAt],
    );
    await deleteItems(q, userId, [drop.id]);
    return { item: (await getItem(q, userId, keep.id)) as ShelfItem, removedId: drop.id };
  });
}
