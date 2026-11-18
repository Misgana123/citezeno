/* Find Papers settings, all from server environment variables so they can
   change without a code change. Nothing here is sent to the browser.

     OPENALEX_API_KEY            the OpenAlex key (server only)
     OPENALEX_BASE_URL           default https://api.openalex.org
     OPENALEX_TIMEOUT_MS         per-call timeout (default 10000)
     PAPERS_DAILY_SEARCHES       searches per user per day (default 100)
     PAPERS_DAILY_ALERT_USD      log a warning once spending passes this (default 0.8)
     PAPERS_DAILY_CAP_USD        stop calling OpenAlex once spending passes this (default 2)
     PAPERS_CACHE_SEARCH_S       search cache time (default 1 day)
     PAPERS_CACHE_PAPER_S        single paper / related list cache time (default 7 days) */

type Env = Record<string, string | undefined>;

export type PapersConfig = {
  apiKey: string | null;
  baseUrl: string;
  timeoutMs: number;
  dailySearchesPerUser: number;
  dailyAlertUsd: number;
  dailyCapUsd: number;
  cacheSearchS: number;
  cachePaperS: number;
};

function positive(v: string | undefined, fallback: number) {
  const n = Number(v);
  return v != null && v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : fallback;
}

export function papersConfig(env: Env = process.env): PapersConfig {
  return {
    apiKey: env.OPENALEX_API_KEY?.trim() || null,
    baseUrl: (env.OPENALEX_BASE_URL?.trim() || 'https://api.openalex.org').replace(/\/+$/, ''),
    timeoutMs: positive(env.OPENALEX_TIMEOUT_MS, 10_000),
    dailySearchesPerUser: Math.floor(positive(env.PAPERS_DAILY_SEARCHES, 100)),
    dailyAlertUsd: positive(env.PAPERS_DAILY_ALERT_USD, 0.8),
    dailyCapUsd: positive(env.PAPERS_DAILY_CAP_USD, 2),
    cacheSearchS: Math.floor(positive(env.PAPERS_CACHE_SEARCH_S, 86_400)),
    cachePaperS: Math.floor(positive(env.PAPERS_CACHE_PAPER_S, 7 * 86_400)),
  };
}
