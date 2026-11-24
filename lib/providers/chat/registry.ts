import { geminiProvider } from '../gemini';
import { openRouterProvider } from '../openrouter';
import type { ChatProviderDefinition } from './types';

/* Every chat model provider. OpenRouter serves most models (from its live
   list); Gemini, called directly, is the fallback. To add one: implement
   ChatProvider in lib/providers/<name>/ (its calls through the gate it is
   given), add it here, and add its models to models.ts (or list them live
   with `models()`). No agent code changes. */
export const CHAT_PROVIDERS: Readonly<Record<string, ChatProviderDefinition>> = {
  [openRouterProvider.name]: openRouterProvider,
  [geminiProvider.name]: geminiProvider,
};
