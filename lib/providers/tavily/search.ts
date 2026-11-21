import { createHash } from 'node:crypto';
import { ProviderError } from '../errors';
import type { GatewayPolicy, Transport } from '../gateway/types';
import type { Env, Gate } from '../types';
import type { WebResult, WebSearch, WebSearchOptions } from '../web-search/types';

/* Tavily web search (POST /search, no SDK). TAVILY_API_KEY, server only.

     TAVILY_USD_PER_SEARCH     what one basic search costs us (default 0.008)
     WEB_DAILY_ALERT_USD       log a warning once a day's web spending passes this (default 2)
     WEB_DAILY_CAP_USD         stop searching once it passes this (default 10)

   A basic search is one Tavily credit. The same query is answered from the
   cache for an hour. */

export const PROVIDER = 'tavily';
const LABEL = 'Tavily';
const URL_SEARCH = 'https://api.tavily.com/search';
const TIMEOUT_MS = 20_000;
const CACHE_TTL_S = 60 * 60;
const SNIPPET_CHARS = 600;

type TavilyRequest = { apiKey: string; body: Record<string, unknown>; usd: number };
type TavilyResponse = { results?: { title?: unknown; url?: unknown; content?: unknown; published_date?: unknown }[] };

function positive(v: string | undefined, fallback: number) {
  const n = Number(v);
  return v != null && v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : fallback;
}

function tavilyError(status: number, body: unknown): ProviderError {
  const detail = (body as { detail?: { error?: unknown } | unknown } | null)?.detail;
  const reason = typeof detail === 'string' ? detail.slice(0, 300) : typeof (detail as { error?: unknown })?.error === 'string' ? (detail as { error: string }).error.slice(0, 300) : undefined;
  if (status === 429) return new ProviderError('busy', `${LABEL} is rate limiting requests.`, { provider: PROVIDER, status, reason });
  if (status === 432 || status === 433) return new ProviderError('budget', `${LABEL} credits are spent.`, { provider: PROVIDER, status, reason });
  if (status === 401 || status === 403) return new ProviderError('unavailable', `${LABEL} refused our key.`, { provider: PROVIDER, status, reason: 'auth' });
  if (status === 400 || status === 422) return new ProviderError('bad_request', `${LABEL} could not handle this search.`, { provider: PROVIDER, status, reason });
  return new ProviderError('unavailable', `${LABEL} answered ${status}.`, { provider: PROVIDER, status, reason });
}

export function tavilyTransport(doFetch: typeof fetch = fetch): Transport<TavilyRequest> {
  return {
    async call<T>(req: TavilyRequest) {
      let res: Response;
      try {
        res = await doFetch(URL_SEARCH, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${req.apiKey}` },
          body: JSON.stringify(req.body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
          cache: 'no-store',
        });
      } catch (e) {
        const timedOut = (e as Error)?.name === 'TimeoutError' || (e as Error)?.name === 'AbortError';
        throw new ProviderError('unavailable', timedOut ? `${LABEL} timed out.` : `Could not reach ${LABEL}.`, { provider: PROVIDER, reason: timedOut ? 'timeout' : 'network' });
      }
      const body = (await res.json().catch(() => null)) as TavilyResponse | null;
      if (!res.ok) throw tavilyError(res.status, body);
      if (!body || !Array.isArray(body.results)) throw new ProviderError('unavailable', `${LABEL} sent an unreadable answer.`, { provider: PROVIDER, status: res.status });
      return { body: body as T, costUsd: req.usd, status: res.status };
    },
  };
}

/* Not counted as a paper search (web searches have no per-user limit yet); cached by the request. */
export function tavilyPolicy(env: Env): GatewayPolicy<TavilyRequest> {
  return {
    provider: PROVIDER,
    label: LABEL,
    describe: (req) => ({ search: false, cacheKey: createHash('sha256').update(JSON.stringify(req.body)).digest('hex'), cacheTtlS: CACHE_TTL_S }),
    spend: { dailyAlertUsd: positive(env.WEB_DAILY_ALERT_USD, 2), dailyCapUsd: positive(env.WEB_DAILY_CAP_USD, 10), configHint: 'WEB_DAILY_ALERT_USD and WEB_DAILY_CAP_USD' },
    concurrency: 6,
    maxQueue: 40,
    retryTries: 3,
  };
}

const text = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

export function toWebResults(body: TavilyResponse): WebResult[] {
  return (body.results ?? []).flatMap((r) => {
    const url = text(r.url);
    if (!/^https?:\/\//i.test(url)) return [];
    const published = text(r.published_date);
    const date = published && !Number.isNaN(Date.parse(published)) ? new Date(published).toISOString().slice(0, 10) : null;
    return [{ title: text(r.title) || url, url, snippet: text(r.content).slice(0, SNIPPET_CHARS), published: date }];
  });
}

export function tavily(apiKey: string, usdPerSearch: number, transport: Transport<TavilyRequest>): WebSearch {
  return {
    name: PROVIDER,
    async search(query: string, opts: WebSearchOptions) {
      const body: Record<string, unknown> = {
        query,
        max_results: opts.maxResults,
        search_depth: 'basic',
        topic: opts.topic ?? 'general',
        include_answer: false,
        include_raw_content: false,
        include_images: false,
      };
      // Tavily limits by age only for news
      if (opts.days && opts.topic === 'news') body.days = opts.days;
      const res = await transport.call<TavilyResponse>({ apiKey, body, usd: usdPerSearch });
      return toWebResults(res.body);
    },
  };
}

export function createTavily(env: Env, gate: Gate, doFetch: typeof fetch = fetch): WebSearch | null {
  const key = env.TAVILY_API_KEY?.trim();
  if (!key) return null;
  return tavily(key, positive(env.TAVILY_USD_PER_SEARCH, 0.008), gate(tavilyTransport(doFetch), tavilyPolicy(env)));
}
