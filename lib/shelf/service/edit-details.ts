import { manualDetails, type ManualPaperInput } from '../api/manual-schema';
import { tx, type Db } from '../db';
import { findExactDuplicate } from '../dedupe/exact';
import { ShelfError } from '../errors';
import { getItem } from '../store/items';
import { updatePrivate } from '../store/papers';
import type { ShelfItem } from '../types';
import { alreadySaved } from './shelve';

/* Correct the details of a paper added by hand or imported. OpenAlex papers
   are shared and kept up to date from OpenAlex, so they can't be edited. */
export async function editDetails(db: Db, userId: string, itemId: string, input: ManualPaperInput): Promise<ShelfItem> {
  return tx(db, async (q) => {
    const item = await getItem(q, userId, itemId);
    if (!item) throw new ShelfError('not_found', 'That paper is not on your shelf.');
    if (item.paper.origin === 'provider') throw new ShelfError('bad_request', `Details of papers found in ${item.paper.record?.label ?? 'a paper database'} can’t be edited. They are kept up to date automatically.`);
    const details = { ...manualDetails(input), citedByCount: item.paper.citedByCount, topics: item.paper.topics };
    const dup = details.doi ? await findExactDuplicate(q, userId, { doi: details.doi }) : null;
    if (dup && dup !== itemId) throw alreadySaved(dup);
    await updatePrivate(q, userId, item.paper.id, details);
    return (await getItem(q, userId, itemId)) as ShelfItem;
  });
}
