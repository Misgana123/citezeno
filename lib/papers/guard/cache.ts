import { createHash } from 'node:crypto';
import type { PapersConfig } from '../config';
import type { OpenAlexResponse, QueryParams } from '../openalex/client';
import type { CacheStore } from '../store/types';
import { callKind, type Layer } from './call';

/* Caches OpenAlex responses by the exact request. Because Smart and semantic
   modes fetch the same pool for every page and sort, paging through them is
   served from here too.

   The key is normalized (params sorted, spaces collapsed; semantic text
   lowercased, since case doesn't change meaning). Keyword text keeps its case:
   AND / OR / NOT are operators only in capitals. The key is hashed, so the
   stored key carries no readable search text. */

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
export function ttlFor(path: string, params: QueryParams, config: Pick<PapersConfig, 'cacheSearchS' | 'cachePaperS'>): number {
  const kind = callKind(path, params);
  return kind === 'single' || kind === 'list' ? config.cachePaperS : config.cacheSearchS;
}

export const withCache =
  (store: CacheStore, config: Pick<PapersConfig, 'cacheSearchS' | 'cachePaperS'>, onHit?: () => void): Layer =>
  (inner) => ({
    async get<T>(path: string, params: QueryParams = {}) {
      const key = cacheKey(path, params);
      const hit = await store.get(key).catch(() => null); // a cache outage must not stop searches
      if (hit != null) {
        onHit?.();
        return { body: hit as T, costUsd: 0, status: 200 } satisfies OpenAlexResponse<T>;
      }
      const res = await inner.get<T>(path, params);
      await store.set(key, res.body, ttlFor(path, params, config)).catch((e) => console.warn('[citezeno] papers: cache write failed', e));
      return res;
    },
  });
