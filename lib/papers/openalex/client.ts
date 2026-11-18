import type { PapersConfig } from '../config';
import { PapersError } from '../errors';

/* The only place Find Papers talks to OpenAlex over HTTP.
   It runs on the server: the key goes in the Authorization header (kept out of
   URLs and logs) and never reaches the browser. It makes one call and maps
   failures to PapersError; retries and pacing belong to the queue around it. */

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export type OpenAlexResponse<T> = {
  body: T;
  costUsd: number; // what OpenAlex charged for this call
  status: number;
};

export type OpenAlexClient = {
  get<T>(path: string, params?: QueryParams): Promise<OpenAlexResponse<T>>;
};

type Deps = { config: Pick<PapersConfig, 'apiKey' | 'baseUrl' | 'timeoutMs'>; fetch?: typeof fetch };

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

/* Turn a failed OpenAlex response into a PapersError. */
export function errorFor(status: number, body: unknown, headers: Headers): PapersError {
  const b = (body ?? {}) as { reason?: unknown; error?: unknown; message?: unknown };
  const reason = typeof b.reason === 'string' ? b.reason : undefined;
  if (status === 429) {
    if (reason === 'daily_budget') return new PapersError('budget', 'OpenAlex daily budget is spent.', { status, reason });
    return new PapersError('busy', 'OpenAlex is rate limiting requests.', { status, reason, retryAfterS: retryAfter(headers) });
  }
  if (status === 404) return new PapersError('not_found', 'Paper not found.', { status });
  if (status === 400 || status === 403) {
    // OpenAlex's own wording (which can mention its plans) stays in the details; the user gets ours
    const vendor = typeof b.message === 'string' ? b.message : typeof b.error === 'string' ? b.error : undefined;
    return new PapersError('bad_request', 'This search could not be run. Try fewer or simpler words, or remove a filter.', { status, reason: vendor?.slice(0, 300) });
  }
  return new PapersError('unavailable', `OpenAlex answered ${status}.`, { status });
}

export function createOpenAlexClient({ config, fetch: doFetch = fetch }: Deps): OpenAlexClient {
  return {
    async get<T>(path: string, params: QueryParams = {}) {
      const url = buildUrl(config.baseUrl, path, params);
      const headers: Record<string, string> = { accept: 'application/json' };
      if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;

      let res: Response;
      try {
        res = await doFetch(url, { headers, signal: AbortSignal.timeout(config.timeoutMs), cache: 'no-store' });
      } catch (e) {
        const timedOut = (e as Error)?.name === 'TimeoutError' || (e as Error)?.name === 'AbortError';
        throw new PapersError('unavailable', timedOut ? 'OpenAlex timed out.' : 'Could not reach OpenAlex.', { reason: timedOut ? 'timeout' : 'network' });
      }

      const body = await readJson(res);
      if (!res.ok) throw errorFor(res.status, body, res.headers);
      if (body == null || typeof body !== 'object') throw new PapersError('unavailable', 'OpenAlex sent an unreadable answer.', { status: res.status });
      return { body: body as T, costUsd: readCost(body, res.headers), status: res.status };
    },
  };
}
