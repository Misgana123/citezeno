import { anthropicProvider } from '../anthropic';
import { geminiProvider } from '../gemini';
import { openaiProvider } from '../openai';
import type { ChatProviderDefinition } from './types';

/* Every chat model provider. To add one: implement ChatProvider in
   lib/providers/<name>/ (its calls through the gate it is given), add it here,
   and add its models to models.ts. No agent code changes. */
export const CHAT_PROVIDERS: Readonly<Record<string, ChatProviderDefinition>> = {
  [geminiProvider.name]: geminiProvider,
  [openaiProvider.name]: openaiProvider,
  [anthropicProvider.name]: anthropicProvider,
};
