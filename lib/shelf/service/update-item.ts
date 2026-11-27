import type { ManualPaperInput } from '../api/manual-schema';
import type { Db } from '../db';
import { ShelfError } from '../errors';
import { updateItem } from '../store/items';
import type { ReadingStatus, ShelfItem } from '../types';
import { editDetails } from './edit-details';

/* Change a saved paper's note or reading status, or correct the details of a
   paper added by hand or imported. */
export type ItemChanges = { note?: string | null; readingStatus?: ReadingStatus; details?: ManualPaperInput };

export async function changeItem(db: Db, userId: string, id: string, { details, ...patch }: ItemChanges): Promise<ShelfItem> {
  if (details) await editDetails(db, userId, id, details);
  const item = await updateItem(db, userId, id, patch);
  if (!item) throw new ShelfError('not_found', 'That paper is not on your shelf.');
  return item;
}
