import { ProviderError } from '../errors';
import type { GatewayPolicy, Transport } from '../gateway/types';
import type { Env } from '../types';
import { costOf, type ChatModel } from './types';

/* Shared plumbing for chat adapters: one JSON POST to a vendor, its failures
   in the common errors, and the gateway policy every chat provider uses. */

/* Builds a streamed answer from the vendor's server-sent events: each event's
   JSON goes to `event` as it arrives; `result` gives the finished answer
   (shaped like the vendor's one-shot answer) and its token counts. */
export type StreamAccumulator = {
  event(data: unknown): void;
  result(): { body: unknown; usage: Usage };
};

/* One call to a chat vendor: a one-shot JSON answer, or a streamed one when
   `stream` is set. Both go through the same gateway layers (cap, cost log,
   limits, retries); a streamed call's cost is logged when the stream ends. */
export type ChatHttpRequest = { model: ChatModel; url: string; headers: Record<string, string>; body: unknown; stream?: StreamAccumulator };

/* Token counts, and what the call cost when the vendor says so (OpenRouter does). */
export type Usage = { inputTokens: number; outputTokens: number; costUsd?: number };

/* Reads the token counts (and any stated cost) out of a vendor's answer. */
export type UsageReader = (body: unknown) => Usage;

const TIMEOUT_MS = 90_000;

function retryAfter(headers: Headers): number | undefined {
  const n = Number(headers.get('retry-after'));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/* The vendor's own error message, for logs only (users get ours). */
/* The vendor's own error message, for logs only (users get ours). OpenRouter
   adds which host behind it failed and that host's own words. */
function vendorMessage(body: unknown): string | undefined {
  const b = body as { error?: { message?: unknown; metadata?: { provider_name?: unknown; raw?: unknown } } | string; message?: unknown } | null;
  const m = typeof b?.error === 'string' ? b.error : (b?.error?.message ?? b?.message);
  if (typeof m !== 'string') return undefined;
  const meta = typeof b?.error === 'object' ? b.error.metadata : undefined;
  const host = typeof meta?.provider_name === 'string' ? ` (${meta.provider_name})` : '';
  const raw = typeof meta?.raw === 'string' ? `: ${meta.raw.replace(/\s+/g, ' ')}` : '';
  return `${m}${host}${raw}`.slice(0, 300);
}

export function chatError(provider: string, label: string, status: number, body: unknown, headers: Headers): ProviderError {
  const reason = vendorMessage(body);
  if (status === 429) {
    // a spent account quota is not something a retry fixes
    if (reason && /quota|billing|credit balance/i.test(reason)) return new ProviderError('budget', `${label} quota is spent.`, { provider, status, reason });
    return new ProviderError('busy', `${label} is rate limiting requests.`, { provider, status, reason, retryAfterS: retryAfter(headers) });
  }
  if (status === 400 || status === 413 || status === 422) return new ProviderError('bad_request', `${label} could not handle this request.`, { provider, status, reason });
  if (status === 402) return new ProviderError('unavailable', `${label} is out of credits.`, { provider, status, reason: 'credits' });
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
      if (req.stream && res.ok) {
        await readEvents(res, (data) => {
          const err = (data as { type?: unknown; error?: unknown } | null)?.error;
          // an error sent mid-stream: not retried (part of the answer may already be shown)
          if (err && ((data as { type?: unknown }).type === 'error' || typeof err === 'object')) {
            throw new ProviderError('unavailable', `${label} stopped while answering.`, { provider, status: res.status, reason: vendorMessage(data) });
          }
          req.stream!.event(data);
        }).catch((e) => {
          if (e instanceof ProviderError) throw e;
          const timedOut = (e as Error)?.name === 'TimeoutError' || (e as Error)?.name === 'AbortError';
          throw new ProviderError('unavailable', timedOut ? `${label} timed out.` : `${label} stopped while answering.`, { provider, reason: timedOut ? 'timeout' : 'network' });
        });
        const { body, usage } = req.stream.result();
        return { body: body as T, costUsd: costOf(req.model, usage), status: res.status };
      }
      const body = await res.json().catch(() => null);
      if (!res.ok) throw chatError(provider, label, res.status, body, res.headers);
      if (body == null || typeof body !== 'object') throw new ProviderError('unavailable', `${label} sent an unreadable answer.`, { provider, status: res.status });
      return { body: body as T, costUsd: costOf(req.model, readUsage(body)), status: res.status };
    },
  };
}

/* Reads a server-sent event stream, handing each event's JSON data on. */
async function readEvents(res: Response, onData: (data: unknown) => void): Promise<void> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let data: string[] = [];
  const flush = () => {
    if (!data.length) return;
    const raw = data.join('\n');
    data = [];
    if (raw.trim() === '[DONE]') return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return; // not JSON (a keep-alive or comment): skip it
    }
    onData(parsed);
  };
  const line = (l: string) => {
    if (l === '') flush();
    else if (l.startsWith('data:')) data.push(l.slice(5).replace(/^ /, ''));
    // "event:", "id:", "retry:" and ":" comments carry nothing we need (the JSON says its type)
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buffer.search(/\r?\n/)) >= 0) {
      const m = buffer.match(/\r?\n/)!;
      line(buffer.slice(0, i));
      buffer = buffer.slice(i + m[0].length);
    }
  }
  buffer += decoder.decode();
  if (buffer) line(buffer);
  flush();
}

function positive(v: string | undefined, fallback: number) {
  const n = Number(v);
  return v != null && v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : fallback;
}

/* The most a chat call may cost: its whole request as prompt (about 4
   characters a token) and every output token it allows (2048 when the
   vendor's body doesn't say). */
export function estimateChatRequest(r: ChatHttpRequest): number {
  const json = JSON.stringify(r.body ?? '');
  const max = Number(json.match(/"max_?(?:output_?|completion_?)?tokens"\s*:\s*(\d+)/i)?.[1]) || 2048;
  return (Math.ceil(json.length / 4) * r.model.inputUsdPerM + max * r.model.outputUsdPerM) / 1_000_000;
}

/* Never cached (every turn differs); limited, retried and capped per provider.
     AI_DAILY_ALERT_USD   log and email once a provider's spending passes this (default 5)
     AI_DAILY_CAP_USD     stop calling a provider once its spending passes this (default 20) */
export function chatPolicy(provider: string, label: string, env: Env): GatewayPolicy<ChatHttpRequest> {
  return {
    provider,
    label,
    describe: () => ({ search: false, cacheKey: null, cacheTtlS: 0 }),
    estimateUsd: estimateChatRequest,
    spend: { dailyAlertUsd: positive(env.AI_DAILY_ALERT_USD, 5), dailyCapUsd: positive(env.AI_DAILY_CAP_USD, 20), configHint: 'AI_DAILY_ALERT_USD and AI_DAILY_CAP_USD' },
    concurrency: 8,
    maxQueue: 40,
    retryTries: 3,
  };
}

/* Token counts as non-negative integers. */
export const tokens = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
