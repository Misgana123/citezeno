import type { Db } from '../db';
import { possibleDuplicatesOf } from '../dedupe/possible';
import type { ShelfItem } from '../types';

/* What a save answers: the new item and any papers already on the shelf that
   may be the same one (so the page can offer to merge them). */
export type DupSummary = { id: string; title: string; year: number | null };

export async function savedResponse(db: Db, userId: string, item: ShelfItem, pending = false) {
  const dups = await possibleDuplicatesOf(db, userId, item.id);
  return { item, pending, possibleDuplicates: dups.map((d): DupSummary => ({ id: d.id, title: d.paper.title, year: d.paper.year })) };
}
