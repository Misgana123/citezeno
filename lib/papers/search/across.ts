import type { PaperSources } from '@/lib/providers/papers/sources';
import type { PaperPage, PaperSource } from '@/lib/providers/papers/types';
import type { Paper } from '../types';
import { fuseRanked } from './fuse';
import { keywordSearch, KEYWORD_PER_PAGE } from './keyword';
import { matchesFilters, sortPapers } from './postprocess';
import type { SearchRequest } from './request';
import type { PaperListResult, SearchNotice } from './types';

/* Searching every enabled paper source at once (PAPER_PROVIDERS). The primary
   source leads; the others add their own top matches, merged by rank fusion
   with duplicates (same ID or DOI) folded together. A source that fails or is
   busy is left out and the user is told results may be incomplete; only when
   every source fails does the search fail. With one source enabled, nothing
   changes.

   The other sources get a deadline (PAPERS_EXTRA_WAIT_MS, default 8 s): one
   that is slow or down is left out rather than holding everyone's search up.
   Its call keeps going, so its answer is cached for the next search. */

/* Results each additional source adds to a page (the primary fills a whole page). */
export const EXTRA_PER_PAGE = 10;

export const extraSources = (sources: PaperSources): PaperSource[] => sources.all.slice(1);

export type Settled<T> = { name: string; ok: true; value: T } | { name: string; ok: false; error: unknown };

export const DEFAULT_EXTRA_WAIT_MS = 8000;

/* How long the other sources may take (PAPERS_EXTRA_WAIT_MS). */
export function extraWaitMs(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.PAPERS_EXTRA_WAIT_MS);
  return env.PAPERS_EXTRA_WAIT_MS?.trim() && Number.isFinite(n) && n > 0 ? n : DEFAULT_EXTRA_WAIT_MS;
}

class TooSlow extends Error {
  constructor() {
    super('No answer in time.');
    this.name = 'TooSlow';
  }
}

/* A task's answer, or TooSlow after `ms` (the task itself keeps going). */
function within<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new TooSlow()), ms)));
  p.catch(() => {}); // a late failure is nobody's concern
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

/* Run every task (those with a deadline only that long); collect what worked
   and what failed, never throwing. */
export async function settleAll<T>(tasks: { name: string; run: () => Promise<T>; deadlineMs?: number }[]): Promise<Settled<T>[]> {
  return Promise.all(
    tasks.map(async (t): Promise<Settled<T>> => {
      try {
        const run = t.run();
        return { name: t.name, ok: true, value: await (t.deadlineMs ? within(run, t.deadlineMs) : run) };
      } catch (error) {
        return { name: t.name, ok: false, error };
      }
    }),
  );
}

/* The error to report when nothing worked: the primary's (it explains best). */
export const firstError = <T>(results: Settled<T>[]) => (results.find((r) => !r.ok) as { error: unknown } | undefined)?.error;

/* Another source's results, kept only where they match the user's filters
   (some sources can't apply every filter themselves). */
export const filtered = (papers: Paper[], req: SearchRequest) => papers.filter((p) => matchesFilters(p, req.filters));

/* Keyword search across sources: page N is every source's page N, merged. */
export async function keywordAcross(sources: PaperSources, req: SearchRequest, deadlineMs = extraWaitMs()): Promise<PaperListResult> {
  const extras = extraSources(sources);
  if (!extras.length) return keywordSearch(sources.primary, req);

  const ask = (s: PaperSource, perPage: number) => () => s.search({ text: req.query, filters: req.filters, sort: req.sort, page: req.page, perPage });
  const results = await settleAll<PaperPage & { perPage: number }>([
    { name: sources.primary.name, run: async () => ({ ...(await ask(sources.primary, KEYWORD_PER_PAGE)()), perPage: KEYWORD_PER_PAGE }) },
    ...extras.map((s) => ({ name: s.name, deadlineMs, run: async () => ({ ...(await ask(s, EXTRA_PER_PAGE)()), perPage: EXTRA_PER_PAGE }) })),
  ]);
  const ok = results.filter((r): r is Extract<Settled<PaperPage & { perPage: number }>, { ok: true }> => r.ok);
  if (!ok.length) throw firstError(results);

  const lists = ok.map((r, i) => (r.name === sources.primary.name && i === 0 ? r.value.papers : filtered(r.value.papers, req)));
  const merged = sortPapers(fuseRanked(lists), req.sort);
  const notices: SearchNotice[] = req.truncated ? ['query_truncated'] : [];
  if (ok.length < results.length) notices.push('partial_results');
  return {
    list: {
      papers: merged,
      total: ok.reduce((n, r) => n + r.value.total, 0),
      page: req.page,
      perPage: merged.length,
      hasMore: ok.some((r) => req.page * r.value.perPage < r.value.total),
      mode: 'keyword',
      sort: req.sort,
      notices,
    },
    costUsd: ok.reduce((n, r) => n + r.value.costUsd, 0),
    searches: 1,
  };
}
