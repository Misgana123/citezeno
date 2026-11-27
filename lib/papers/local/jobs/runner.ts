import type { PaperEnricher } from '@/lib/providers/enrich/types';
import type { PaperSources } from '@/lib/providers/papers/sources';
import { enrichPapers } from '../../enrich';
import type { LocalCopyConfig, SeedPlan } from '../config';
import { dueForRefresh, needingFill, saveFilled, saveRefreshed, trimCopy } from '../maintain';
import { syncState, saveSyncState } from '../sync';
import { recordKey, type PaperCopyStore, type Queryable } from '../types';

/* Keeping our own copy of papers filled and up to date, run by the cron route.
   Each step gets part of the time, so one slow step can't starve the others.

   1. seed     — download each source's slice (PAPERS_SEED_*) a page at a time,
                 resuming where the last run stopped; once complete, only top up
                 with new papers every PAPERS_SYNC_EVERY_HOURS
   2. fill     — ask the fill-in services (PAPER_ENRICHERS) about papers with gaps
   3. refresh  — recheck the oldest kept papers with their provider
   4. trim     — keep the copy within PAPERS_LOCAL_MAX_ROWS / _MAX_MB */

export type CopyJobDeps = {
  db: Queryable;
  copy: PaperCopyStore;
  sources: () => PaperSources;
  enrichers: () => PaperEnricher[];
  config: LocalCopyConfig;
  now?: () => number;
};
export type CopyStep = (deps: CopyJobDeps, deadline: number) => Promise<Record<string, number | string>>;

export const SEED_PAGE = 200;
const EMPTY = 'empty page; trying again next run';
/* The jobs' time per run: Vercel stops the route at 60 s, and a call already
   on its way when time runs out may still take a while (timeout, one retry). */
export const RUN_BUDGET_MS = 40_000;
const REFRESH_BATCH = 100;
const TRIM_BATCH = 2000;
const HOUR_MS = 3_600_000;

async function seedOne(deps: CopyJobDeps, plan: SeedPlan, deadline: number): Promise<{ added: number; note?: string }> {
  const now = deps.now ?? Date.now;
  const source = deps.sources().named(plan.source);
  if (!source?.browse) return { added: 0, note: 'not enabled' };
  const state = await syncState(deps.db, plan.source);
  // complete: reached its target, or its source had nothing more (a raised target resumes the download)
  const topUp = state.doneAt != null && (state.fetched >= plan.target || state.cursor == null);
  if (topUp && (plan.order === 'cited' || (state.ranAt && now() - new Date(state.ranAt).getTime() < deps.config.syncEveryHours * HOUR_MS))) return { added: 0 };

  let added = 0;
  try {
    if (topUp) {
      // the newest papers since last time: one page from the start
      const page = await source.browse({ cursor: null, perPage: SEED_PAGE, order: plan.order, sinceYear: plan.sinceYear });
      await deps.copy.save(page.papers, { detail: false, origin: `seed:${plan.source}`, seen: false });
      await saveSyncState(deps.db, { ...state, lastError: null }, new Date(now()));
      return { added: page.papers.length };
    }
    while (now() < deadline - 2000 && state.fetched < plan.target) {
      const page = await source.browse({ cursor: state.cursor, perPage: Math.min(SEED_PAGE, plan.target - state.fetched), order: plan.order, sinceYear: plan.sinceYear });
      if (!page.papers.length && state.lastError !== EMPTY) {
        // an empty page may be a hiccup rather than the end: try again next run, and believe it the second time
        await saveSyncState(deps.db, { ...state, lastError: EMPTY }, new Date(now()));
        return { added, note: 'empty page' };
      }
      await deps.copy.save(page.papers, { detail: false, origin: `seed:${plan.source}`, seen: false });
      added += page.papers.length;
      state.fetched += page.papers.length;
      state.cursor = page.next;
      state.doneAt = !page.next || state.fetched >= plan.target ? new Date(now()) : null;
      state.lastError = null;
      await saveSyncState(deps.db, state, new Date(now()));
      if (state.doneAt) break;
    }
    return { added };
  } catch (e) {
    await saveSyncState(deps.db, { ...state, lastError: ((e as Error)?.message ?? String(e)).slice(0, 300) }, new Date(now()));
    return { added, note: 'failed' };
  }
}

export const seedStep: CopyStep = async (deps, deadline) => {
  const now = deps.now ?? Date.now;
  const report: Record<string, number | string> = {};
  const plans = deps.config.seeds;
  for (let i = 0; i < plans.length; i++) {
    // each remaining source gets an equal part of the time left
    const slice = now() + (deadline - now()) / (plans.length - i);
    const r = await seedOne(deps, plans[i], Math.min(deadline, slice));
    report[`seeded_${plans[i].source}`] = r.note ?? r.added;
  }
  return report;
};

export const fillStep: CopyStep = async (deps, deadline): Promise<Record<string, number | string>> => {
  const enrichers = deps.enrichers();
  if (!enrichers.length) return { filled: 'no PAPER_ENRICHERS' };
  const rows = await needingFill(deps.db, deps.config.fillBatch);
  if (!rows.length) return { filled: 0 };
  const keyOf = new Map(rows.map((r) => [r.paper.id, r.key]));
  const r = await enrichPapers(
    rows.map((x) => x.paper),
    enrichers,
    { deadline, now: deps.now },
  );
  const filled = r.papers.filter((p) => r.changed.has(p.id)).map((p) => ({ key: keyOf.get(p.id) as string, paper: p }));
  await saveFilled(
    deps.db,
    rows.map((x) => x.key),
    filled,
  );
  return { filled: filled.length, askedToFill: rows.length };
};

export const refreshStep: CopyStep = async (deps): Promise<Record<string, number | string>> => {
  const rows = await dueForRefresh(deps.db, deps.config.refreshDays, REFRESH_BATCH);
  if (!rows.length) return { refreshed: 0 };
  const sources = deps.sources();
  const fresh: { key: string; paper: (typeof rows)[number]['paper'] }[] = [];
  const byProvider = new Map<string, typeof rows>();
  for (const r of rows) byProvider.set(r.paper.provider, [...(byProvider.get(r.paper.provider) ?? []), r]);
  for (const [provider, group] of byProvider) {
    const source = sources.named(provider);
    if (!source?.getPapers) continue; // not enabled now: counted as checked, so the queue moves on
    const ids = group.map((r) => r.paper.id.slice(provider.length + 1));
    try {
      const { found } = await source.getPapers('id', ids);
      for (const r of group) {
        const p = found.get(r.paper.id.slice(provider.length + 1));
        if (p) fresh.push({ key: recordKey(r.paper), paper: p });
      }
    } catch (e) {
      console.warn(`[citezeno] papers: refreshing the copy from ${provider} failed`, (e as Error)?.message ?? e);
    }
  }
  await saveRefreshed(
    deps.db,
    rows.map((r) => r.key),
    fresh,
  );
  return { refreshed: fresh.length, checked: rows.length };
};

export const trimStep: CopyStep = async (deps) => ({ trimmed: await trimCopy(deps.db, { maxRows: deps.config.maxRows, maxBytes: deps.config.maxBytes }, TRIM_BATCH) });

export const DEFAULT_STEPS: { name: string; share: number; run: CopyStep }[] = [
  { name: 'seed', share: 0.6, run: seedStep },
  { name: 'fill', share: 0.2, run: fillStep },
  { name: 'refresh', share: 0.15, run: refreshStep },
  { name: 'trim', share: 0.05, run: trimStep },
];

export async function runCopyJobs(deps: CopyJobDeps, budgetMs: number, steps = DEFAULT_STEPS): Promise<Record<string, unknown>> {
  if (!deps.config.enabled) return { skipped: 'PAPERS_LOCAL_COPY is off' };
  const now = deps.now ?? Date.now;
  const start = now();
  const report: Record<string, unknown> = {};
  for (const step of steps) {
    const deadline = Math.min(start + budgetMs, now() + budgetMs * step.share);
    try {
      Object.assign(report, await step.run(deps, deadline));
    } catch (e) {
      console.error(`[citezeno] papers: copy job "${step.name}" failed`, e);
      report[`${step.name}Error`] = (e as Error).message;
    }
  }
  return report;
}
