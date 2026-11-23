import { createHash } from 'node:crypto';
import type { CallInfo, GatewayPolicy } from '../gateway/types';
import type { OpenAlexRequest, QueryParams } from './client';
import { PROVIDER } from './client';
import type { OpenAlexConfig } from './config';

/* What each OpenAlex call means to the gateway: whether it is a priced search,
   how it is cached and for how long, and whether it needs a semantic slot. */

export type CallKind = 'semantic' | 'keyword' | 'list' | 'single';

export function callKind(path: string, params: QueryParams = {}): CallKind {
  if (params['search.semantic'] != null) return 'semantic';
  if (params.search != null) return 'keyword';
  return /^\/works\/[^/]+$/.test(path) ? 'single' : 'list';
}

/* Searches are what OpenAlex prices per search and what users' limits count. */
export const isSearch = (kind: CallKind) => kind === 'semantic' || kind === 'keyword';

/* The cache key: params sorted, spaces collapsed, filter parts sorted, semantic
   text lowercased (case doesn't change meaning). Keyword text keeps its case:
   AND / OR / NOT are operators only in capitals. Hashed, so the stored key
   carries no readable search text. Smart and semantic modes fetch the same pool
   for every page and sort, so paging through them is served from the cache. */
export function cacheKey(path: string, params: QueryParams = {}): string {
  const entries = Object.entries(params)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => {
      let s = String(v).replace(/\s+/g, ' ').trim();
      if (k === 'search.semantic') s = s.toLowerCase();
      if (k === 'filter') s = s.split(',').sort().join(',');
      return [k, s] as const;
    })
    .sort(([a], [b]) => a.localeCompare(b));
  return createHash('sha256').update(JSON.stringify([path, entries])).digest('hex');
}

/* Searches keep for a day; single papers and related lists for a week. */
export function ttlFor(path: string, params: QueryParams, config: Pick<OpenAlexConfig, 'cacheSearchS' | 'cachePaperS'>): number {
  const kind = callKind(path, params);
  return kind === 'single' || kind === 'list' ? config.cachePaperS : config.cacheSearchS;
}

/* OpenAlex allows one semantic search per second per key. */
export const SEMANTIC_INTERVAL_MS = 1100; // with a little margin

/* Five failures within 30 s pause OpenAlex calls for 30 s (per server instance). */
export const BREAKER = { failures: 5, windowMs: 30_000, cooldownMs: 30_000 };

/* Calls to OpenAlex at once, and how many may wait; past that, "busy". */
const CONCURRENCY = 8;
const MAX_QUEUE = 40;

export function openAlexPolicy(config: Pick<OpenAlexConfig, 'cacheSearchS' | 'cachePaperS' | 'cacheStaleS' | 'dailyAlertUsd' | 'dailyCapUsd' | 'ratePerS' | 'maxWaitMs'>): GatewayPolicy<OpenAlexRequest> {
  return {
    provider: PROVIDER,
    label: 'OpenAlex',
    describe({ path, params = {} }): CallInfo {
      const kind = callKind(path, params);
      return {
        search: isSearch(kind),
        cacheKey: cacheKey(path, params),
        cacheTtlS: ttlFor(path, params, config),
        pace: kind === 'semantic' ? { key: 'semantic', intervalMs: SEMANTIC_INTERVAL_MS, maxWaitMs: config.maxWaitMs } : undefined,
      };
    },
    spend: { dailyAlertUsd: config.dailyAlertUsd, dailyCapUsd: config.dailyCapUsd, configHint: 'PAPERS_DAILY_ALERT_USD and PAPERS_DAILY_CAP_USD' },
    concurrency: CONCURRENCY,
    maxQueue: MAX_QUEUE,
    retryTries: 3,
    rate: { perSecond: config.ratePerS, maxWaitMs: config.maxWaitMs },
    // every OpenAlex call is a read, so a hiccup is worth one more try
    retryTransient: 1,
    staleS: config.cacheStaleS,
    breaker: BREAKER,
  };
}
