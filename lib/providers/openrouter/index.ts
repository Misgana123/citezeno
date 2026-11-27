import type { ChatProviderDefinition } from '../chat/types';
import type { EmbeddingsProviderDefinition } from '../embeddings/types';
import { createOpenRouterChat } from './chat';
import { createOpenRouterEmbeddings } from './embed';
import { openRouterModels } from './models';
import { PROVIDER } from './policy';

/* OpenRouter, registered as a chat model provider (its models come from its
   live list) and an embeddings provider. Not configured (no key) → null. */
export const openRouterProvider: ChatProviderDefinition = {
  name: PROVIDER,
  create: (env, gate) => createOpenRouterChat(env, gate, undefined, openRouterModels(gate, PROVIDER)),
};

export const openRouterEmbeddingsProvider: EmbeddingsProviderDefinition = {
  name: PROVIDER,
  create: (env, gate) => createOpenRouterEmbeddings(env, gate),
};
