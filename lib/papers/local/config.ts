/* Settings for our own copy of papers, from server environment variables:

     PAPERS_LOCAL_COPY           keep a copy of every paper users see, and answer single
                                 papers from it (default off; "1" to turn on)
     PAPERS_LOCAL_FRESH_DAYS     how old a kept paper may be and still be served (default 7)
     PAPERS_LOCAL_FIRST          search the copy first; answer from it when it has enough
                                 matches (default off; needs PAPERS_LOCAL_COPY)
     PAPERS_LOCAL_MIN_RESULTS    "enough": matches the copy needs to answer a search (default 50)

   Filling it in the background (the cron job, only with PAPERS_LOCAL_COPY on;
   a source is downloaded only when it is listed in PAPER_PROVIDERS):

     PAPERS_SEED_OPENALEX        most-cited papers to download from OpenAlex (default 50000; 0 = none)
     PAPERS_SEED_ARXIV           newest arXiv papers, last PAPERS_SEED_YEARS years (default 25000)
     PAPERS_SEED_EUROPEPMC       newest PubMed papers with abstracts, via Europe PMC (default 25000)
     PAPERS_SEED_YEARS           how many recent years the newest-papers downloads cover (default 3)
     PAPERS_SYNC_EVERY_HOURS     once a download is complete, how often it tops up with new papers (default 12)
     PAPERS_LOCAL_REFRESH_DAYS   recheck kept papers with their provider after this many days (default 30)
     PAPERS_FILL_BATCH           papers per run sent to the fill-in services (PAPER_ENRICHERS) (default 20)
     PAPERS_LOCAL_MAX_ROWS       most papers kept (default 150000)
     PAPERS_LOCAL_MAX_MB         most space the copy may take, in MB (default 500): past either
                                 limit, the least-seen papers are removed first */

type Env = Record<string, string | undefined>;

/* A background download: which source, which papers, how many. */
export type SeedPlan = { source: string; order: 'cited' | 'newest'; target: number; sinceYear: number | null };

export type LocalCopyConfig = {
  enabled: boolean;
  freshDays: number;
  searchFirst: boolean;
  minResults: number;
  seeds: SeedPlan[];
  syncEveryHours: number;
  refreshDays: number;
  fillBatch: number;
  maxRows: number;
  maxBytes: number;
};

const on = (v: string | undefined) => /^(1|true|yes|on)$/i.test(v?.trim() ?? '');

function positive(v: string | undefined, fallback: number) {
  const n = Number(v);
  return v != null && v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : fallback;
}

function count(v: string | undefined, fallback: number) {
  const n = Number(v);
  return v != null && v.trim() !== '' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/* The ~100k split: the most-cited papers across all subjects, plus the newest preprints and medical papers. */
export function seedPlans(env: Env, now: number): SeedPlan[] {
  const since = new Date(now).getUTCFullYear() - Math.floor(positive(env.PAPERS_SEED_YEARS, 3)) + 1;
  return [
    { source: 'openalex', order: 'cited' as const, target: count(env.PAPERS_SEED_OPENALEX, 50_000), sinceYear: null },
    { source: 'arxiv', order: 'newest' as const, target: count(env.PAPERS_SEED_ARXIV, 25_000), sinceYear: since },
    { source: 'europepmc', order: 'newest' as const, target: count(env.PAPERS_SEED_EUROPEPMC, 25_000), sinceYear: since },
  ].filter((s) => s.target > 0);
}

export function localCopyConfig(env: Env = process.env, now: number = Date.now()): LocalCopyConfig {
  const enabled = on(env.PAPERS_LOCAL_COPY);
  return {
    enabled,
    freshDays: positive(env.PAPERS_LOCAL_FRESH_DAYS, 7),
    searchFirst: enabled && on(env.PAPERS_LOCAL_FIRST),
    minResults: Math.floor(positive(env.PAPERS_LOCAL_MIN_RESULTS, 50)),
    seeds: seedPlans(env, now),
    syncEveryHours: positive(env.PAPERS_SYNC_EVERY_HOURS, 12),
    refreshDays: positive(env.PAPERS_LOCAL_REFRESH_DAYS, 30),
    fillBatch: Math.floor(positive(env.PAPERS_FILL_BATCH, 20)),
    maxRows: Math.floor(positive(env.PAPERS_LOCAL_MAX_ROWS, 150_000)),
    maxBytes: positive(env.PAPERS_LOCAL_MAX_MB, 500) * 1024 * 1024,
  };
}
