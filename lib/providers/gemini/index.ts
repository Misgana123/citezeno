import type { ChatProviderDefinition } from '../chat/types';
import type { EmbeddingsProviderDefinition } from '../embeddings/types';
import { createGeminiChat, PROVIDER } from './chat';
import { createGeminiEmbeddings } from './embed';

/* Gemini, registered as a chat model provider. Not configured (no key) → null. */
export const geminiProvider: ChatProviderDefinition = {
  name: PROVIDER,
  create: (env, gate) => createGeminiChat(env, gate),
};

/* Gemini, registered as an embeddings provider (same key). */
export const geminiEmbeddingsProvider: EmbeddingsProviderDefinition = {
  name: PROVIDER,
  create: (env, gate) => createGeminiEmbeddings(env, gate),
};
