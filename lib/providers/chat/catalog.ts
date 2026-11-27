import type { Env, Gate } from '../types';
import { withFallback } from './fallback';
import { CHAT_MODELS, DEFAULT_CHAT_MODEL, DEFAULT_FALLBACK_MODEL, POPULAR_MODELS } from './models';
import { CHAT_PROVIDERS } from './registry';
import type { ChatModel, ChatProvider, ChatProviderDefinition } from './types';

/* The models on offer right now, and the provider behind each.

     AGENT_MODELS          models offered, comma-separated: IDs, or a maker's
                           models with "*" (e.g. "google/*,anthropic/*");
                           default: every model
     AGENT_DEFAULT_MODEL   the model new chats start with (default google/gemini-3.5-flash-lite)
     AGENT_POPULAR_MODELS  models shown first in the picker, in order: IDs or names as
                           shown ("Claude Sonnet 5.5"); default: POPULAR_MODELS in models.ts
     AI_FALLBACK_MODEL     the direct Gemini model (models.ts) that answers while
                           OpenRouter is down, for models Gemini doesn't serve
                           itself (default google/gemini-3.5-flash-lite)

   The models are OpenRouter's live list (when it has a key) and the fixed ones
   in models.ts. A model is offered only when it is listed, its provider is
   registered, and that provider is configured (has its key). If the default
   isn't on offer, the first model that is becomes the default. */

/* popular: the model's place in the picker's Popular list (0 first), when it is in it */
export type ModelInfo = { id: string; label: string; vendor: string; vendorName: string; popular?: number };

export type ChatModels = {
  readonly models: readonly ChatModel[];
  readonly defaultModel: ChatModel | null;
  /* This model if it is on offer, else the default (null when nothing is). */
  pick(id?: string | null): ChatModel | null;
  /* The provider for this model, with the direct Gemini stand-in behind it when there is one. */
  provider(model: ChatModel): ChatProvider;
  /* What the browser may see about the models: no routes, vendor model names or prices. */
  info(): { models: ModelInfo[]; defaultModel: string | null };
};

/* Who made a model: as stated, else the part of its ID before "/". */
export const vendorOf = (m: ChatModel) => m.vendor ?? (m.id.includes('/') ? m.id.split('/')[0] : m.provider);
const vendorNameOf = (m: ChatModel) => m.vendorName ?? vendorOf(m).replace(/(^|[-_])(\w)/g, (_, s: string, c: string) => (s ? ' ' : '') + c.toUpperCase());

/* The models AGENT_MODELS names, in the order named ("maker/*" takes all of a maker's). */
export function selectModels(catalog: readonly ChatModel[], raw: string | undefined): ChatModel[] {
  const wanted = (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!wanted.length) return [...catalog];
  const out = new Map<string, ChatModel>();
  for (const w of wanted) {
    const prefix = w.endsWith('*') ? w.slice(0, -1) : null;
    for (const m of catalog) if (prefix != null ? m.id.startsWith(prefix) : m.id === w) out.set(m.id, m);
  }
  if (!out.size) console.warn(`[citezeno] chat: AGENT_MODELS matches no model on offer (${raw}); offering every model`);
  return out.size ? [...out.values()] : [...catalog];
}

/* "Claude Sonnet 5.5", "claude-sonnet-5.5" and "anthropic/claude-sonnet-5.5" all name the same model. */
const loose = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/* Each popular model's place in the list. Entries are IDs or names; those not
   on offer are skipped. A list that names nothing on offer falls back to the default. */
export function popularRank(models: readonly ChatModel[], raw: string | undefined): Map<string, number> {
  const find = (entry: string) => models.find((m) => m.id === entry) ?? models.find((m) => [m.label, m.id, m.id.split('/').pop() ?? ''].some((n) => loose(n) === loose(entry)));
  const rank = (entries: readonly string[]) => {
    const out = new Map<string, number>();
    for (const e of entries.map((s) => s.trim()).filter(Boolean)) {
      const m = find(e);
      if (m && !out.has(m.id)) out.set(m.id, out.size);
    }
    return out;
  };
  if (!raw?.trim()) return rank(POPULAR_MODELS);
  const mine = rank(raw.split(','));
  if (mine.size || !models.length) return mine;
  console.warn(`[citezeno] chat: AGENT_POPULAR_MODELS names no model on offer (${raw}); using the default list`);
  return rank(POPULAR_MODELS);
}

export function chatModels(
  env: Env,
  gate: Gate,
  catalog: readonly ChatModel[] = CHAT_MODELS,
  registry: Readonly<Record<string, ChatProviderDefinition>> = CHAT_PROVIDERS,
  fallbackDefault = DEFAULT_CHAT_MODEL,
  backups: readonly ChatModel[] = CHAT_MODELS,
): ChatModels {
  const providers = new Map<string, ChatProvider | null>();
  const providerOf = (name: string) => {
    if (!providers.has(name)) providers.set(name, registry[name]?.create(env, gate) ?? null);
    return providers.get(name) ?? null;
  };
  const models = selectModels(catalog, env.AGENT_MODELS).filter((m) => providerOf(m.provider) != null);

  const wanted = env.AGENT_DEFAULT_MODEL?.trim() || fallbackDefault;
  const defaultModel = models.find((m) => m.id === wanted) ?? models[0] ?? null;

  /* The stand-in for a model: the same model by another configured route, else AI_FALLBACK_MODEL. */
  const fallbackId = env.AI_FALLBACK_MODEL?.trim() || DEFAULT_FALLBACK_MODEL;
  const backupFor = (model: ChatModel) => {
    const usable = backups.filter((b) => b.provider !== model.provider && providerOf(b.provider) != null);
    return usable.find((b) => b.id === model.id) ?? usable.find((b) => b.id === fallbackId) ?? null;
  };

  const rank = popularRank(models, env.AGENT_POPULAR_MODELS);

  return {
    models,
    defaultModel,
    pick: (id) => models.find((m) => m.id === id) ?? defaultModel,
    provider(model) {
      const p = providerOf(model.provider);
      if (!p) throw new Error(`The chat provider "${model.provider}" is not configured.`);
      const backup = backupFor(model);
      return backup ? withFallback(p, providerOf(backup.provider)!, backup) : p;
    },
    info: () => ({
      models: models.map((m) => ({ id: m.id, label: m.label, vendor: vendorOf(m), vendorName: vendorNameOf(m), ...(rank.has(m.id) ? { popular: rank.get(m.id) } : {}) })),
      defaultModel: defaultModel?.id ?? null,
    }),
  };
}

/* The models on offer with each provider's live list added (OpenRouter's,
   cached for a day). A list that can't be had right now is left out: the
   fixed models are still offered. */
export async function loadChatModels(
  env: Env,
  gate: Gate,
  catalog: readonly ChatModel[] = CHAT_MODELS,
  registry: Readonly<Record<string, ChatProviderDefinition>> = CHAT_PROVIDERS,
  fallbackDefault = DEFAULT_CHAT_MODEL,
): Promise<ChatModels> {
  const lists = await Promise.all(
    Object.values(registry).map(async (d) => {
      const p = d.create(env, gate);
      if (!p?.models) return [];
      try {
        return await p.models();
      } catch (e) {
        console.warn(`[citezeno] chat: ${d.name} model list unavailable (${(e as Error)?.message}); offering the fixed models`);
        return [];
      }
    }),
  );
  const live = lists.flat();
  const ids = new Set(live.map((m) => m.id));
  return chatModels(env, gate, [...live, ...catalog.filter((m) => !ids.has(m.id))], registry, fallbackDefault, catalog);
}
