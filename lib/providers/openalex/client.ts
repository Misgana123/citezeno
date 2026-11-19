import { ProviderError } from '../errors';
import type { Transport } from '../gateway/types';
import type { OpenAlexConfig } from './config';

/* The only place the app talks to OpenAlex over HTTP (the browser-side citation
   search is separate). It runs on the server: the key goes in the Authorization
   header (kept out of URLs and logs) and never reaches the browser. It makes one
   call and maps failures to ProviderError; caching, retries and pacing belong
   to the gateway around it. */

export const PROVIDER = 'openalex';

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

/* One OpenAlex call: a GET of `path` with query parameters. */
export type OpenAlexRequest = { path: string; params?: QueryParams };

export type OpenAlexTransport = Transport<OpenAlexRequest>;

type Deps = { config: Pick<OpenAlexConfig, 'apiKey' | 'baseUrl' | 'timeoutMs'>; fetch?: typeof fetch };

export function buildUrl(baseUrl: string, path: string, params: QueryParams = {}) {
  const url = new URL(baseUrl + (path.startsWith('/') ? path : `/${path}`));
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') url.searchParams.set(k, String(v));
  }
  return url;
}

/* Cost from the body's meta.cost_usd, falling back to the response header. */
export function readCost(body: unknown, headers: Headers): number {
  const meta = (body as { meta?: { cost_usd?: unknown } } | null)?.meta;
  const fromBody = Number(meta?.cost_usd);
  if (Number.isFinite(fromBody) && fromBody >= 0) return fromBody;
  const fromHeader = Number(headers.get('x-ratelimit-cost-usd'));
  return Number.isFinite(fromHeader) && fromHeader >= 0 ? fromHeader : 0;
}

function retryAfter(headers: Headers): number | undefined {
  const n = Number(headers.get('retry-after'));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/* Turn a failed OpenAlex response into a ProviderError. */
export function errorFor(status: number, body: unknown, headers: Headers): ProviderError {
  const b = (body ?? {}) as { reason?: unknown; error?: unknown; message?: unknown };
  const reason = typeof b.reason === 'string' ? b.reason : undefined;
  const provider = PROVIDER;
  if (status === 429) {
    if (reason === 'daily_budget') return new ProviderError('budget', 'OpenAlex daily budget is spent.', { provider, status, reason });
    return new ProviderError('busy', 'OpenAlex is rate limiting requests.', { provider, status, reason, retryAfterS: retryAfter(headers) });
  }
  if (status === 404) return new ProviderError('not_found', 'Paper not found.', { provider, status });
  if (status === 400 || status === 403) {
    // OpenAlex's own wording (which can mention its plans) stays in the details; the user gets ours
    const vendor = typeof b.message === 'string' ? b.message : typeof b.error === 'string' ? b.error : undefined;
    return new ProviderError('bad_request', 'This search could not be run. Try fewer or simpler words, or remove a filter.', { provider, status, reason: vendor?.slice(0, 300) });
  }
  return new ProviderError('unavailable', `OpenAlex answered ${status}.`, { provider, status });
}

export function createOpenAlexTransport({ config, fetch: doFetch = fetch }: Deps): OpenAlexTransport {
  return {
    async call<T>({ path, params = {} }: OpenAlexRequest) {
      const url = buildUrl(config.baseUrl, path, params);
      const headers: Record<string, string> = { accept: 'application/json' };
      if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;

      let res: Response;
      try {
        res = await doFetch(url, { headers, signal: AbortSignal.timeout(config.timeoutMs), cache: 'no-store' });
      } catch (e) {
        const timedOut = (e as Error)?.name === 'TimeoutError' || (e as Error)?.name === 'AbortError';
        throw new ProviderError('unavailable', timedOut ? 'OpenAlex timed out.' : 'Could not reach OpenAlex.', { provider: PROVIDER, reason: timedOut ? 'timeout' : 'network' });
      }

      const body = await readJson(res);
      if (!res.ok) throw errorFor(res.status, body, res.headers);
      if (body == null || typeof body !== 'object') throw new ProviderError('unavailable', 'OpenAlex sent an unreadable answer.', { provider: PROVIDER, status: res.status });
      return { body: body as T, costUsd: readCost(body, res.headers), status: res.status };
    },
  };
}
