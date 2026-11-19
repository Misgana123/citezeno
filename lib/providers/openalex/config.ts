/* OpenAlex settings, all from server environment variables so they can change
   without a code change. Nothing here is sent to the browser.

     OPENALEX_API_KEY            the OpenAlex key (server only)
     OPENALEX_BASE_URL           default https://api.openalex.org
     OPENALEX_TIMEOUT_MS         per-call timeout (default 10000)
     OPENALEX_MAX_QUERY_CHARS    search text OpenAlex accepts: 1500 on free keys, up to 2000 on paid plans
     PAPERS_DAILY_ALERT_USD      log a warning once spending passes this (default 0.8)
     PAPERS_DAILY_CAP_USD        stop calling OpenAlex once spending passes this (default 2)
     PAPERS_CACHE_SEARCH_S       search cache time (default 1 day)
     PAPERS_CACHE_PAPER_S        single paper / related list cache time (default 7 days) */

import type { Env } from '../types';

/* Free and keyless accounts may send 1,500 characters per search (keyword or
   semantic); paid plans up to 2,000, which is also all semantic search reads. */
export const QUERY_CHARS_LIMIT = 2000;
export const DEFAULT_QUERY_CHARS = 1500;

export type OpenAlexConfig = {
  apiKey: string | null;
  baseUrl: string;
  timeoutMs: number;
  maxQueryChars: number;
  dailyAlertUsd: number;
  dailyCapUsd: number;
  cacheSearchS: number;
  cachePaperS: number;
};

function positive(v: string | undefined, fallback: number) {
  const n = Number(v);
  return v != null && v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : fallback;
}

export function openAlexConfig(env: Env = process.env): OpenAlexConfig {
  return {
    apiKey: env.OPENALEX_API_KEY?.trim() || null,
    baseUrl: (env.OPENALEX_BASE_URL?.trim() || 'https://api.openalex.org').replace(/\/+$/, ''),
    timeoutMs: positive(env.OPENALEX_TIMEOUT_MS, 10_000),
    maxQueryChars: Math.min(QUERY_CHARS_LIMIT, Math.max(100, Math.floor(positive(env.OPENALEX_MAX_QUERY_CHARS, DEFAULT_QUERY_CHARS)))),
    dailyAlertUsd: positive(env.PAPERS_DAILY_ALERT_USD, 0.8),
    dailyCapUsd: positive(env.PAPERS_DAILY_CAP_USD, 2),
    cacheSearchS: Math.floor(positive(env.PAPERS_CACHE_SEARCH_S, 86_400)),
    cachePaperS: Math.floor(positive(env.PAPERS_CACHE_PAPER_S, 7 * 86_400)),
  };
}
