import type { ChatProviderDefinition } from '../chat/types';
import { createGeminiChat, PROVIDER } from './chat';

/* Gemini, registered as a chat model provider. Not configured (no key) → null. */
export const geminiProvider: ChatProviderDefinition = {
  name: PROVIDER,
  create: (env, gate) => createGeminiChat(env, gate),
};
