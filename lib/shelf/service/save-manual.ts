import { manualDetails, type ManualPaperInput } from '../api/manual-schema';
import type { Db } from '../db';
import { createPrivate } from '../store/papers';
import type { ShelfItem } from '../types';
import { shelve } from './shelve';

/* A paper the user typed in. It gets its own private record ("Added manually"),
   and a DOI, when given, still blocks an exact duplicate. */
export async function saveManualPaper(db: Db, userId: string, input: ManualPaperInput, projectId?: string | null, via: 'manual' | 'upload' = 'manual'): Promise<ShelfItem> {
  const details = manualDetails(input);
  return shelve(db, userId, {
    keys: { doi: details.doi },
    via,
    projectId,
    paper: (q) => createPrivate(q, userId, details, 'manual'),
  });
}
