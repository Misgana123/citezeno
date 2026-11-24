import type { ChatModel } from '../chat/types';
import { ProviderError } from '../errors';
import type { GatewayPolicy, Transport } from '../gateway/types';
import type { Gate } from '../types';
import { BASE, LABEL } from './policy';

/* OpenRouter's live list of chat models, with their prices. Asked for at most
   once a day (the gateway caches it); while OpenRouter is down, the last list
   is kept for up to 30 days. Only models our assistant can use are kept: they
   call tools, answer in text, and have a fixed price (no free tiers, batch-only
   variants, aliases or automatic routers). */

const NAME = 'openrouter-models';
const TIMEOUT_MS = 20_000;
const DAY_S = 86_400;

/* One model, as kept in the cache (the full list is close to a megabyte). */
export type ListedModel = { id: string; name: string; inPerM: number; outPerM: number; images: boolean };

type ListRequest = { url: string };

type WireModel = {
  id?: unknown;
  name?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown };
  architecture?: { input_modalities?: unknown; output_modalities?: unknown };
  supported_parameters?: unknown;
};

const perMillion = (v: unknown) => {
  const n = Number(v);
  return typeof v === 'string' && v.trim() !== '' && Number.isFinite(n) && n >= 0 ? Math.round(n * 1e6 * 1e6) / 1e6 : null;
};

const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/* The models we can offer, from OpenRouter's answer. */
export function usableModels(data: unknown): ListedModel[] {
  const rows = (data as { data?: unknown } | null)?.data;
  if (!Array.isArray(rows)) return [];
  const out: ListedModel[] = [];
  for (const m of rows as WireModel[]) {
    if (typeof m?.id !== 'string' || typeof m.name !== 'string') continue;
    const [vendor] = m.id.split('/');
    if (!m.id.includes('/') || m.id.includes(':') || m.id.startsWith('~') || vendor === 'openrouter') continue;
    if (!list(m.supported_parameters).includes('tools')) continue;
    if (list(m.architecture?.output_modalities).join() !== 'text') continue;
    const inPerM = perMillion(m.pricing?.prompt);
    const outPerM = perMillion(m.pricing?.completion);
    if (inPerM == null || outPerM == null || inPerM + outPerM === 0) continue;
    out.push({ id: m.id, name: m.name, inPerM, outPerM, images: list(m.architecture?.input_modalities).includes('image') });
  }
  return out;
}

/* "Google: Gemini 4 Neon" → maker "Google", label "Gemini 4 Neon". */
export function toChatModel(m: ListedModel, provider: string): ChatModel {
  const i = m.name.indexOf(': ');
  const vendor = m.id.split('/')[0];
  return {
    id: m.id,
    provider,
    label: i > 0 ? m.name.slice(i + 2) : m.name,
    vendorModel: m.id,
    inputUsdPerM: m.inPerM,
    outputUsdPerM: m.outPerM,
    vendor,
    vendorName: i > 0 ? m.name.slice(0, i) : vendor,
    images: m.images,
  };
}

export function modelListTransport(doFetch: typeof fetch = fetch): Transport<ListRequest> {
  return {
    async call<T>(req: ListRequest) {
      let res: Response;
      try {
        res = await doFetch(req.url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
      } catch (e) {
        const timedOut = (e as Error)?.name === 'TimeoutError' || (e as Error)?.name === 'AbortError';
        throw new ProviderError('unavailable', timedOut ? `${LABEL} model list timed out.` : `Could not reach ${LABEL}.`, { provider: NAME, reason: timedOut ? 'timeout' : 'network' });
      }
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new ProviderError(res.status === 429 ? 'busy' : 'unavailable', `${LABEL} model list answered ${res.status}.`, { provider: NAME, status: res.status });
      const models = usableModels(body);
      // an empty list is never cached: it would hide every model for a day
      if (!models.length) throw new ProviderError('unavailable', `${LABEL} sent an empty model list.`, { provider: NAME, status: res.status, reason: 'empty_answer' });
      return { body: models as T, costUsd: 0, status: res.status };
    },
  };
}

export function modelListPolicy(): GatewayPolicy<ListRequest> {
  return {
    provider: NAME,
    label: `${LABEL} models`,
    describe: () => ({ search: false, cacheKey: 'chat', cacheTtlS: DAY_S }),
    staleS: 30 * DAY_S,
    spend: null,
    concurrency: 2,
    maxQueue: 50,
    retryTries: 2,
    retryTransient: 1,
  };
}

/* The live list as chat models served by `provider`. */
export function openRouterModels(gate: Gate, provider: string, doFetch?: typeof fetch): () => Promise<ChatModel[]> {
  const transport = gate(modelListTransport(doFetch), modelListPolicy());
  return async () => {
    const { body } = await transport.call<ListedModel[]>({ url: `${BASE}/models` });
    return (Array.isArray(body) ? body : []).map((m) => toChatModel(m, provider));
  };
}
