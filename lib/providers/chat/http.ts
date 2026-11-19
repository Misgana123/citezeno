import { ProviderError } from '../errors';
import type { GatewayPolicy, Transport } from '../gateway/types';
import type { Env } from '../types';
import { costOf, type ChatModel } from './types';

/* Shared plumbing for chat adapters: one JSON POST to a vendor, its failures
   in the common errors, and the gateway policy every chat provider uses. */

/* One call to a chat vendor. */
export type ChatHttpRequest = { model: ChatModel; url: string; headers: Record<string, string>; body: unknown };

/* Reads the token counts out of a vendor's answer. */
export type UsageReader = (body: unknown) => { inputTokens: number; outputTokens: number };

const TIMEOUT_MS = 90_000;

function retryAfter(headers: Headers): number | undefined {
  const n = Number(headers.get('retry-after'));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/* The vendor's own error message, for logs only (users get ours). */
function vendorMessage(body: unknown): string | undefined {
  const b = body as { error?: { message?: unknown; type?: unknown; status?: unknown } | string; message?: unknown } | null;
  const m = typeof b?.error === 'string' ? b.error : (b?.error?.message ?? b?.message);
  return typeof m === 'string' ? m.slice(0, 300) : undefined;
}

export function chatError(provider: string, label: string, status: number, body: unknown, headers: Headers): ProviderError {
  const reason = vendorMessage(body);
  if (status === 429) {
    // a spent account quota is not something a retry fixes
    if (reason && /quota|billing|credit balance/i.test(reason)) return new ProviderError('budget', `${label} quota is spent.`, { provider, status, reason });
    return new ProviderError('busy', `${label} is rate limiting requests.`, { provider, status, reason, retryAfterS: retryAfter(headers) });
  }
  if (status === 400 || status === 413 || status === 422) return new ProviderError('bad_request', `${label} could not handle this request.`, { provider, status, reason });
  if (status === 401 || status === 403) return new ProviderError('unavailable', `${label} refused our key.`, { provider, status, reason: 'auth' });
  if (status === 404) return new ProviderError('unavailable', `${label} does not offer this model.`, { provider, status, reason: reason ?? 'model' });
  if (status === 503 || status === 529) return new ProviderError('busy', `${label} is overloaded.`, { provider, status, reason });
  return new ProviderError('unavailable', `${label} answered ${status}.`, { provider, status, reason });
}

export function chatTransport(provider: string, label: string, readUsage: UsageReader, doFetch: typeof fetch = fetch): Transport<ChatHttpRequest> {
  return {
    async call<T>(req: ChatHttpRequest) {
      let res: Response;
      try {
        res = await doFetch(req.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...req.headers },
          body: JSON.stringify(req.body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
          cache: 'no-store',
        });
      } catch (e) {
        const timedOut = (e as Error)?.name === 'TimeoutError' || (e as Error)?.name === 'AbortError';
        throw new ProviderError('unavailable', timedOut ? `${label} timed out.` : `Could not reach ${label}.`, { provider, reason: timedOut ? 'timeout' : 'network' });
      }
      const body = await res.json().catch(() => null);
      if (!res.ok) throw chatError(provider, label, res.status, body, res.headers);
      if (body == null || typeof body !== 'object') throw new ProviderError('unavailable', `${label} sent an unreadable answer.`, { provider, status: res.status });
      return { body: body as T, costUsd: costOf(req.model, readUsage(body)), status: res.status };
    },
  };
}

function positive(v: string | undefined, fallback: number) {
  const n = Number(v);
  return v != null && v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : fallback;
}

/* Never cached (every turn differs); limited, retried and capped per provider.
     AI_DAILY_ALERT_USD   log and email once a provider's spending passes this (default 5)
     AI_DAILY_CAP_USD     stop calling a provider once its spending passes this (default 20) */
export function chatPolicy(provider: string, label: string, env: Env): GatewayPolicy<ChatHttpRequest> {
  return {
    provider,
    label,
    describe: () => ({ search: false, cacheKey: null, cacheTtlS: 0 }),
    spend: { dailyAlertUsd: positive(env.AI_DAILY_ALERT_USD, 5), dailyCapUsd: positive(env.AI_DAILY_CAP_USD, 20), configHint: 'AI_DAILY_ALERT_USD and AI_DAILY_CAP_USD' },
    concurrency: 8,
    maxQueue: 40,
    retryTries: 3,
  };
}

/* Token counts as non-negative integers. */
export const tokens = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
