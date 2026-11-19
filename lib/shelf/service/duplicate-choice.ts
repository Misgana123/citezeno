import type { Db } from '../db';
import { keepBoth } from '../dedupe/possible';
import { ShelfError } from '../errors';
import { mergeItems, type MergeResult } from './merge';

/* What the user decided about a pair of possible duplicates: merge them, or
   keep both (and stop offering the pair). */
export async function decideDuplicate(db: Db, userId: string, action: 'merge' | 'keep_both', a: string, b: string): Promise<MergeResult | { ok: true }> {
  if (action === 'merge') return mergeItems(db, userId, a, b);
  if (!(await keepBoth(db, userId, a, b))) throw new ShelfError('not_found', 'One of these papers is no longer on your shelf.');
  return { ok: true };
}
