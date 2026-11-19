import type { ChatProviderDefinition } from '../chat/types';
import { createAnthropicChat, PROVIDER } from './chat';

/* Anthropic, registered as a chat model provider. Not configured (no key) → null. */
export const anthropicProvider: ChatProviderDefinition = {
  name: PROVIDER,
  create: (env, gate) => createAnthropicChat(env, gate),
};
