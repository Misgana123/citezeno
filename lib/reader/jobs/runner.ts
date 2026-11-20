import type { ReaderDeps } from '../deps';
import { processNext } from '../service/process';
import { forgetStoredCopy, queueReembedding, staleSharedCopies } from '../store/texts';
import { vectorSchema } from '../vector';

/* Everything the reader does in the background, run by its cron route each minute.
     1. process  — extract and embed papers' text, oldest first
     2. reembed  — papers embedded with another model or size go back to step 1's embedding
     3. cleanup  — shared open-access copies nobody opened for a while leave storage */

export async function runReaderJobs(deps: ReaderDeps, budgetMs: number, opts: { sharedKeepDays: number }): Promise<Record<string, number>> {
  const now = deps.now ?? Date.now;
  const deadline = now() + budgetMs;
  const report = { processed: 0, failed: 0, requeued: 0, copiesRemoved: 0 };

  const embedder = deps.embedder();
  if (embedder && (await vectorSchema(deps.db))) report.requeued = await queueReembedding(deps.db, embedder.model.id, embedder.dimensions);

  if (deps.store) {
    for (const c of await staleSharedCopies(deps.db, opts.sharedKeepDays)) {
      try {
        await deps.store.remove(c.storageKey);
        await forgetStoredCopy(deps.db, c.id);
        report.copiesRemoved++;
      } catch (e) {
        console.warn('[citezeno] reader: could not remove an old shared copy', e);
      }
    }
  }

  while (now() < deadline - 8000) {
    const r = await processNext(deps, { deadline });
    if (r === 'idle') break;
    if (r === 'failed') report.failed++;
    else report.processed++;
  }
  return report;
}
