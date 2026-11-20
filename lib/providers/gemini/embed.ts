import { chatError, tokens } from '../chat/http';
import { ProviderError } from '../errors';
import type { EmbeddingsProvider, EmbedInput, EmbedKind, EmbedRequest } from '../embeddings/types';
import type { GatewayPolicy, Transport } from '../gateway/types';
import type { Env, Gate } from '../types';

/* Gemini embeddings, batchEmbedContents (no SDK). GEMINI_API_KEY, server only.
   Calls share Gemini's daily AI spending alert and cap with its chat models.

   gemini-embedding-001 takes the job as a task type (and a title for
   documents); gemini-embedding-2 takes it as a prefix in the text instead.
   001 leaves out token usage, so its cost is estimated from the text length. */

export const PROVIDER = 'gemini';
const LABEL = 'Gemini embeddings';
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 60_000;

/* Vendor models that want the task written into the text. */
const PREFIX_MODELS = new Set(['gemini-embedding-2']);

type EmbedHttpRequest = { url: string; apiKey: string; body: unknown; usdPerM: number; estimatedTokens: number };
type BatchResponse = { embeddings?: { values?: number[] }[]; usageMetadata?: { promptTokenCount?: number } };

/* About four characters a token, for English text. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

export function geminiEmbedRequest(vendorModel: string, kind: EmbedKind, input: EmbedInput, dimensions: number): Record<string, unknown> {
  const title = input.title?.trim() || null;
  const base = { model: `models/${vendorModel}`, outputDimensionality: dimensions };
  if (PREFIX_MODELS.has(vendorModel)) {
    const text = kind === 'query' ? `task: search result | query: ${input.text}` : `title: ${title ?? 'none'} | text: ${input.text}`;
    return { ...base, content: { parts: [{ text }] } };
  }
  return { ...base, content: { parts: [{ text: input.text }] }, taskType: kind === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT', ...(kind === 'document' && title ? { title } : {}) };
}

export function geminiEmbedTransport(doFetch: typeof fetch = fetch): Transport<EmbedHttpRequest> {
  return {
    async call<T>(req: EmbedHttpRequest) {
      let res: Response;
      try {
        res = await doFetch(req.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': req.apiKey },
          body: JSON.stringify(req.body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
          cache: 'no-store',
        });
      } catch (e) {
        const timedOut = (e as Error)?.name === 'TimeoutError' || (e as Error)?.name === 'AbortError';
        throw new ProviderError('unavailable', timedOut ? `${LABEL} timed out.` : `Could not reach ${LABEL}.`, { provider: PROVIDER, reason: timedOut ? 'timeout' : 'network' });
      }
      const body = (await res.json().catch(() => null)) as BatchResponse | null;
      if (!res.ok) throw chatError(PROVIDER, LABEL, res.status, body, res.headers);
      if (!body || !Array.isArray(body.embeddings)) throw new ProviderError('unavailable', `${LABEL} sent an unreadable answer.`, { provider: PROVIDER, status: res.status });
      const used = tokens(body.usageMetadata?.promptTokenCount) || req.estimatedTokens;
      return { body: body as T, costUsd: (used * req.usdPerM) / 1_000_000, status: res.status };
    },
  };
}

function positive(v: string | undefined, fallback: number) {
  const n = Number(v);
  return v != null && v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : fallback;
}

/* Same provider name as Gemini chat, so both count toward one daily AI cap. */
export function geminiEmbedPolicy(env: Env): GatewayPolicy<EmbedHttpRequest> {
  return {
    provider: PROVIDER,
    label: 'Gemini',
    describe: () => ({ search: false, cacheKey: null, cacheTtlS: 0 }),
    spend: { dailyAlertUsd: positive(env.AI_DAILY_ALERT_USD, 5), dailyCapUsd: positive(env.AI_DAILY_CAP_USD, 20), configHint: 'AI_DAILY_ALERT_USD and AI_DAILY_CAP_USD' },
    concurrency: 8,
    maxQueue: 40,
    retryTries: 3,
  };
}

export function geminiEmbeddings(apiKey: string, transport: Transport<EmbedHttpRequest>): EmbeddingsProvider {
  return {
    name: PROVIDER,
    async embed(req: EmbedRequest) {
      if (!req.inputs.length) return { vectors: [], tokens: 0, costUsd: 0 };
      const vendor = req.model.vendorModel;
      const requests = req.inputs.map((input) => geminiEmbedRequest(vendor, req.kind, input, req.dimensions));
      const estimatedTokens = req.inputs.reduce((n, i) => n + estimateTokens(i.text) + estimateTokens(i.title ?? ''), 0);
      const { body, costUsd } = await transport.call<BatchResponse>({
        url: `${BASE}/${encodeURIComponent(vendor)}:batchEmbedContents`,
        apiKey,
        body: { requests },
        usdPerM: req.model.usdPerM,
        estimatedTokens,
      });
      const vectors = (body.embeddings ?? []).map((e) => e.values ?? []);
      if (vectors.length !== req.inputs.length || vectors.some((v) => v.length !== req.dimensions)) {
        throw new ProviderError('unavailable', `${LABEL} sent the wrong number or size of vectors.`, { provider: PROVIDER });
      }
      return { vectors, tokens: tokens(body.usageMetadata?.promptTokenCount) || estimatedTokens, costUsd };
    },
  };
}

export function createGeminiEmbeddings(env: Env, gate: Gate, doFetch?: typeof fetch): EmbeddingsProvider | null {
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  return geminiEmbeddings(key, gate(geminiEmbedTransport(doFetch), geminiEmbedPolicy(env)));
}
