import { chooseProviders } from '../config';
import type { Env, Gate } from '../types';
import { CHAT_MODELS, DEFAULT_CHAT_MODEL } from './models';
import { CHAT_PROVIDERS } from './registry';
import type { ChatModel, ChatProvider, ChatProviderDefinition } from './types';

/* The models on offer right now, and the provider behind each.

     AGENT_MODELS          model IDs offered, comma-separated (default: every model in models.ts)
     AGENT_DEFAULT_MODEL   the model new chats start with (default gemini-flash-lite)

   A model is offered only when it is listed, its provider is registered, and
   that provider is configured (has its key). If the default isn't on offer,
   the first model that is becomes the default. */

export type ModelInfo = Pick<ChatModel, 'id' | 'label' | 'provider'>;

export type ChatModels = {
  readonly models: readonly ChatModel[];
  readonly defaultModel: ChatModel | null;
  /* This model if it is on offer, else the default (null when nothing is). */
  pick(id?: string | null): ChatModel | null;
  provider(model: ChatModel): ChatProvider;
  /* What the browser may see about the models: no vendor names, no prices. */
  info(): { models: ModelInfo[]; defaultModel: string | null };
};

export function chatModels(
  env: Env,
  gate: Gate,
  catalog: readonly ChatModel[] = CHAT_MODELS,
  registry: Readonly<Record<string, ChatProviderDefinition>> = CHAT_PROVIDERS,
  fallbackDefault = DEFAULT_CHAT_MODEL,
): ChatModels {
  const byId = Object.fromEntries(catalog.map((m) => [m.id, m]));
  const listed = chooseProviders(byId, env.AGENT_MODELS, catalog.map((m) => m.id), 'chat model');

  const providers = new Map<string, ChatProvider | null>();
  const providerOf = (name: string) => {
    if (!providers.has(name)) providers.set(name, registry[name]?.create(env, gate) ?? null);
    return providers.get(name) ?? null;
  };
  const models = listed.filter((m) => providerOf(m.provider) != null);

  const wanted = env.AGENT_DEFAULT_MODEL?.trim() || fallbackDefault;
  const defaultModel = models.find((m) => m.id === wanted) ?? models[0] ?? null;

  return {
    models,
    defaultModel,
    pick: (id) => models.find((m) => m.id === id) ?? defaultModel,
    provider(model) {
      const p = providerOf(model.provider);
      if (!p) throw new Error(`The chat provider "${model.provider}" is not configured.`);
      return p;
    },
    info: () => ({ models: models.map(({ id, label, provider }) => ({ id, label, provider })), defaultModel: defaultModel?.id ?? null }),
  };
}
