import { PLAN_KEYS, PLANS } from '@/lib/plans';
import type { FileStore } from '@/lib/providers/storage/types';
import type { PaperSources } from '@/lib/providers/papers/sources';
import type { Db } from '../db';
import { shelfConfig } from '../config';
import { runImportSlice } from '../service/import-run';
import { refreshPapers } from '../service/refresh';
import { emptyTrash } from '../service/trash';
import { deleteOldImports } from '../store/imports';
import { deleteAbandoned } from '../store/pdfs';

/* Everything Shelf does in the background, run by the cron route each minute.
   Each step gets part of the time, so one slow step can't starve the others.

   1. imports  — work through waiting imports, oldest first
   2. storage  — remove deleted PDFs from storage
   3. refresh  — recheck saved papers with the paper source (citations, retractions)
   4. cleanup  — forget unfinished uploads and old import summaries */

export type RunnerDeps = { db: Db; sources: () => PaperSources; store: FileStore | null; now?: () => number };
export type RunnerStep = (deps: RunnerDeps, deadline: number) => Promise<Record<string, number | string>>;

export const importStep: RunnerStep = async (deps, deadline) => {
  const now = deps.now ?? Date.now;
  let slices = 0;
  while (now() < deadline - 2000) {
    const r = await runImportSlice({ db: deps.db, papers: deps.sources().primary, now }, { budgetMs: deadline - now() - 1000 });
    if (r === 'busy') break; // nothing waiting (or all locked by open pages)
    slices++;
  }
  return { importSlices: slices };
};

export const storageStep: RunnerStep = async (deps) => {
  const { removed, failed } = await emptyTrash(deps.db, deps.store, 50);
  return { filesRemoved: removed, filesFailed: failed };
};

export const refreshStep: RunnerStep = async (deps, deadline) => {
  const config = shelfConfig();
  // how often depends on the plans of the people who saved each paper
  const byPlan = Object.fromEntries(PLAN_KEYS.map((k) => [k, PLANS[k].limits.shelfRefreshDays]));
  const r = await refreshPapers(deps.db, deps.sources(), { olderThanDays: config.refreshDays, batches: config.refreshBatches, deadline, now: deps.now, byPlan });
  return { papersRefreshed: r.refreshed, newlyRetracted: r.newlyRetracted, retractionNotices: r.notices, papersMissing: r.missing };
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
  { name: 'imports', share: 0.5, run: importStep },
  { name: 'storage', share: 0.15, run: storageStep },
  { name: 'refresh', share: 0.2, run: refreshStep },
  { name: 'cleanup', share: 0.1, run: cleanupStep },
];
