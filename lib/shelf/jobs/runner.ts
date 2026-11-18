import type { OpenAlexClient } from '@/lib/papers/openalex/client';
import type { Db } from '../db';
import { runImportSlice } from '../service/import-run';
import { emptyTrash } from '../service/trash';
import type { FileStore } from '../storage/types';
import { deleteOldImports } from '../store/imports';
import { deleteAbandoned } from '../store/pdfs';

/* Everything Shelf does in the background, run by the cron route each minute.
   Each step gets part of the time, so one slow step can't starve the others.

   1. imports  — work through waiting imports, oldest first
   2. storage  — remove deleted PDFs from storage
   3. cleanup  — forget unfinished uploads and old import summaries
   (more steps are added by later features) */

export type RunnerDeps = { db: Db; client: () => OpenAlexClient; store: FileStore | null; now?: () => number };
export type RunnerStep = (deps: RunnerDeps, deadline: number) => Promise<Record<string, number | string>>;

export const importStep: RunnerStep = async (deps, deadline) => {
  const now = deps.now ?? Date.now;
  let slices = 0;
  while (now() < deadline - 2000) {
    const r = await runImportSlice({ db: deps.db, client: deps.client(), now }, { budgetMs: deadline - now() - 1000 });
    if (r === 'busy') break; // nothing waiting (or all locked by open pages)
    slices++;
  }
  return { importSlices: slices };
};

export const storageStep: RunnerStep = async (deps) => {
  const { removed, failed } = await emptyTrash(deps.db, deps.store, 50);
  return { filesRemoved: removed, filesFailed: failed };
};

export const cleanupStep: RunnerStep = async (deps) => ({ abandonedUploads: await deleteAbandoned(deps.db), oldImports: await deleteOldImports(deps.db) });

export async function runShelfJobs(deps: RunnerDeps, budgetMs: number, steps: { name: string; share: number; run: RunnerStep }[]): Promise<Record<string, unknown>> {
  const now = deps.now ?? Date.now;
  const start = now();
  const report: Record<string, unknown> = {};
  for (const step of steps) {
    const deadline = Math.min(start + budgetMs, now() + budgetMs * step.share);
    try {
      Object.assign(report, await step.run(deps, deadline));
    } catch (e) {
      console.error(`[citezeno] shelf job "${step.name}" failed`, e);
      report[`${step.name}Error`] = (e as Error).message;
    }
  }
  return report;
}

export const DEFAULT_STEPS = [
  { name: 'imports', share: 0.6, run: importStep },
  { name: 'storage', share: 0.15, run: storageStep },
  { name: 'cleanup', share: 0.1, run: cleanupStep },
];
