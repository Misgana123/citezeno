import { chatError, tokens } from '../chat/http';
import { taskText } from '../embeddings/task';
import type { EmbeddingsProvider, EmbedRequest } from '../embeddings/types';
import { ProviderError } from '../errors';
import type { Transport } from '../gateway/types';
import type { Env, Gate } from '../types';
import { BASE, LABEL, openRouterKey, openRouterPolicy, PROVIDER } from './policy';

/* OpenRouter embeddings (OpenAI's format, no SDK). Same key and daily AI cap
   as its chat models. Models that read the job from the text get it written in. */

const TIMEOUT_MS = 60_000;

type EmbedHttpRequest = { apiKey: string; body: unknown; usdPerM: number; estimatedTokens: number };
type EmbedResponse = { data?: { embedding?: number[]; index?: number }[]; usage?: { prompt_tokens?: number; total_tokens?: number; cost?: number }; error?: { message?: string } };

const estimateTokens = (text: string) => Math.ceil(text.length / 4);

export function openRouterEmbedTransport(doFetch: typeof fetch = fetch): Transport<EmbedHttpRequest> {
  return {
    async call<T>(req: EmbedHttpRequest) {
      let res: Response;
      try {
        res = await doFetch(`${BASE}/embeddings`, {
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
      const body = (await res.json().catch(() => null)) as EmbedResponse | null;
      if (!res.ok) throw chatError(PROVIDER, LABEL, res.status, body, res.headers);
      if (!body || !Array.isArray(body.data)) throw new ProviderError('unavailable', `${LABEL} sent an unreadable answer.`, { provider: PROVIDER, status: res.status, reason: body?.error?.message?.slice(0, 300) });
      const cost = Number(body.usage?.cost);
      const used = tokens(body.usage?.prompt_tokens ?? body.usage?.total_tokens) || req.estimatedTokens;
      return { body: body as T, costUsd: body.usage?.cost != null && Number.isFinite(cost) && cost >= 0 ? cost : (used * req.usdPerM) / 1_000_000, status: res.status };
    },
  };
}

export function openRouterEmbeddings(apiKey: string, transport: Transport<EmbedHttpRequest>): EmbeddingsProvider {
  return {
    name: PROVIDER,
    async embed(req: EmbedRequest) {
      if (!req.inputs.length) return { vectors: [], tokens: 0, costUsd: 0 };
      const input = req.inputs.map((i) => (req.model.taskInText ? taskText(req.kind, i) : i.text));
      const estimatedTokens = input.reduce((n, t) => n + estimateTokens(t), 0);
      const { body, costUsd } = await transport.call<EmbedResponse>({
        apiKey,
        body: { model: req.model.vendorModel, input, dimensions: req.dimensions, encoding_format: 'float' },
        usdPerM: req.model.usdPerM,
        estimatedTokens,
      });
      // in the order sent (each answer says its place)
      const rows = [...(body.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      const vectors = rows.map((r) => r.embedding ?? []);
      if (vectors.length !== req.inputs.length || vectors.some((v) => v.length !== req.dimensions)) {
        throw new ProviderError('unavailable', `${LABEL} sent the wrong number or size of vectors.`, { provider: PROVIDER });
      }
      return { vectors, tokens: tokens(body.usage?.prompt_tokens ?? body.usage?.total_tokens) || estimatedTokens, costUsd };
    },
  };
}

export function createOpenRouterEmbeddings(env: Env, gate: Gate, doFetch?: typeof fetch): EmbeddingsProvider | null {
  const key = openRouterKey(env);
  if (!key) return null;
  return openRouterEmbeddings(key, gate(openRouterEmbedTransport(doFetch), openRouterPolicy<EmbedHttpRequest>(env)));
}
