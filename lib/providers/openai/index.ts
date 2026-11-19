import type { ChatProviderDefinition } from '../chat/types';
import { createOpenAiChat, PROVIDER } from './chat';

/* OpenAI, registered as a chat model provider. Not configured (no key) → null. */
export const openaiProvider: ChatProviderDefinition = {
  name: PROVIDER,
  create: (env, gate) => createOpenAiChat(env, gate),
};
