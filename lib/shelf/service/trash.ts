import type { Db } from '../db';
import type { FileStore } from '../storage/types';
import { settleTrash, takeTrash } from '../store/pdfs';

/* Remove queued files from storage. Failures are retried on later runs. */
export async function emptyTrash(db: Db, store: FileStore | null, limit = 25): Promise<{ removed: number; failed: number }> {
  if (!store) return { removed: 0, failed: 0 };
  const keys = await takeTrash(db, limit);
  const removed: string[] = [];
  const failed: string[] = [];
  for (const key of keys) {
    try {
      await store.remove(key);
      removed.push(key);
    } catch (e) {
      console.warn('[citezeno] shelf: could not remove a stored file', (e as Error).message);
      failed.push(key);
    }
  }
  await settleTrash(db, removed, failed);
  return { removed: removed.length, failed: failed.length };
}
