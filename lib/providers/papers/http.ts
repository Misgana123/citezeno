import { createHash } from 'node:crypto';
import { ProviderError } from '../errors';
import type { GatewayPolicy, Transport } from '../gateway/types';
import { sharedProviderConfig } from '../shared';
import type { Env } from '../types';

/* What the scholarly paper adapters (arXiv, PubMed, Europe PMC, Semantic
   Scholar, ClinicalTrials.gov…) share: one HTTP call shape, the same error
   mapping, and one way to describe their calls to the gateway. Each adapter
   still owns its paths, parameters and record format. */

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

/* One call: GET `path` with `params` (or POST with a JSON `body`). */
export type ScholarlyRequest = { path: string; params?: QueryParams; body?: unknown };

export type ScholarlyTransport = Transport<ScholarlyRequest>;

export type HttpSettings = {
  provider: string;
  label: string;
  baseUrl: string;
  timeoutMs: number;
  userAgent: string;
  /* 'xml' answers come back as text for the adapter to parse. */
  format: 'json' | 'xml';
  /* Sent with every call but never part of the cache key (keys, contact details). */
  headers?: Record<string, string>;
  params?: QueryParams;
  fetch?: typeof fetch;
};

export function buildUrl(baseUrl: string, path: string, params: QueryParams = {}) {
  const url = new URL(baseUrl + (path.startsWith('/') ? path : `/${path}`));
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') url.searchParams.set(k, String(v));
  return url;
}

function retryAfter(headers: Headers): number | undefined {
  const n = Number(headers.get('retry-after'));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/* A failed answer → ProviderError. The vendor's own wording stays in the details. */
export function httpError(s: Pick<HttpSettings, 'provider' | 'label'>, status: number, text: string, headers: Headers): ProviderError {
  const provider = s.provider;
  const reason = text.replace(/\s+/g, ' ').trim().slice(0, 300) || undefined;
  if (status === 429) return new ProviderError('busy', `${s.label} is rate limiting requests.`, { provider, status, reason, retryAfterS: retryAfter(headers) });
  if (status === 404) return new ProviderError('not_found', 'Paper not found.', { provider, status });
  if (status === 401 || status === 403) return new ProviderError('unavailable', `${s.label} refused our request.`, { provider, status, reason: 'auth' });
  if (status === 400 || status === 422) return new ProviderError('bad_request', 'This search could not be run. Try fewer or simpler words, or remove a filter.', { provider, status, reason });
  return new ProviderError('unavailable', `${s.label} answered ${status}.`, { provider, status });
}

export function scholarlyTransport(s: HttpSettings): ScholarlyTransport {
  const doFetch = s.fetch ?? fetch;
  return {
    async call<T>({ path, params = {}, body }: ScholarlyRequest) {
      const url = buildUrl(s.baseUrl, path, { ...params, ...s.params });
      const headers: Record<string, string> = { accept: s.format === 'xml' ? 'application/xml, text/xml' : 'application/json', 'user-agent': s.userAgent, ...s.headers };
      if (body !== undefined) headers['content-type'] = 'application/json';
      let res: Response;
      try {
        res = await doFetch(url, {
          method: body === undefined ? 'GET' : 'POST',
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(s.timeoutMs),
          cache: 'no-store',
        });
      } catch (e) {
        const timedOut = (e as Error)?.name === 'TimeoutError' || (e as Error)?.name === 'AbortError';
        throw new ProviderError('unavailable', timedOut ? `${s.label} timed out.` : `Could not reach ${s.label}.`, { provider: s.provider, reason: timedOut ? 'timeout' : 'network' });
      }
      const text = await res.text().catch(() => '');
      if (!res.ok) throw httpError(s, res.status, text, res.headers);
      if (s.format === 'xml') return { body: text as T, costUsd: 0, status: res.status };
      try {
        const parsed = JSON.parse(text);
        if (parsed == null || typeof parsed !== 'object') throw new Error('not an object');
        return { body: parsed as T, costUsd: 0, status: res.status };
      } catch {
        throw new ProviderError('unavailable', `${s.label} sent an unreadable answer.`, { provider: s.provider, status: res.status });
      }
    },
  };
}

/* Settings every scholarly adapter takes from the environment (shared names, so
   one change covers them all): cache times, the wait limit, our contact. */
export type ScholarlyBasics = { cacheSearchS: number; cachePaperS: number; cacheStaleS: number; maxWaitMs: number; userAgent: string; contactEmail: string | null; timeoutMs: number };

function num(v: string | undefined, fallback: number, min = 0) {
  const n = Number(v);
  return v != null && v.trim() !== '' && Number.isFinite(n) && n >= min ? n : fallback;
}

export function scholarlyBasics(env: Env): ScholarlyBasics {
  const shared = sharedProviderConfig(env);
  return {
    cacheSearchS: Math.floor(num(env.PAPERS_CACHE_SEARCH_S, 86_400, 1)),
    cachePaperS: Math.floor(num(env.PAPERS_CACHE_PAPER_S, 7 * 86_400, 1)),
    cacheStaleS: Math.floor(num(env.PAPERS_CACHE_STALE_S, 3 * 86_400)),
    maxWaitMs: shared.maxWaitMs,
    userAgent: shared.userAgent,
    contactEmail: shared.contactEmail,
    timeoutMs: num(env.PAPERS_PROVIDER_TIMEOUT_MS, 15_000, 1000),
  };
}

/* A rate from the environment, kept between a floor and the vendor's ceiling. */
export const rateFrom = (v: string | undefined, fallback: number, max: number) => Math.min(max, num(v, fallback, 0.01));

/* The cache key: path, sorted parameters and body, hashed (no readable search text kept). */
export function requestKey({ path, params = {}, body }: ScholarlyRequest): string {
  const entries = Object.entries(params)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => [k, String(v).replace(/\s+/g, ' ').trim()] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  return createHash('sha256').update(JSON.stringify([path, entries, body ?? null])).digest('hex');
}

/* Five failures in 30 s pause a scholarly source for 30 s (per server instance). */
export const SCHOLARLY_BREAKER = { failures: 5, windowMs: 30_000, cooldownMs: 30_000 };

export type ScholarlyPolicyOptions = {
  provider: string;
  label: string;
  basics: ScholarlyBasics;
  ratePerS: number;
  /* Calls in flight at once per server instance (arXiv allows one). */
  concurrency: number;
  /* Lists and searches keep for the search cache time; single records for the paper one. */
  isRecord(req: ScholarlyRequest): boolean;
};

/* Free sources: nothing to spend, not counted as priced searches. */
export function scholarlyPolicy(o: ScholarlyPolicyOptions): GatewayPolicy<ScholarlyRequest> {
  return {
    provider: o.provider,
    label: o.label,
    describe: (req) => ({ search: false, cacheKey: requestKey(req), cacheTtlS: o.isRecord(req) ? o.basics.cachePaperS : o.basics.cacheSearchS }),
    spend: null,
    concurrency: o.concurrency,
    maxQueue: 40,
    retryTries: 3,
    rate: { perSecond: o.ratePerS, maxWaitMs: o.basics.maxWaitMs },
    retryTransient: 1,
    staleS: o.basics.cacheStaleS,
    breaker: SCHOLARLY_BREAKER,
  };
}
