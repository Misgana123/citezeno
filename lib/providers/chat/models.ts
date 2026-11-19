import type { ChatModel } from './types';

/* The models users can choose from. Adding one is one entry here: our stable
   ID, its provider (a name in registry.ts), a label, the vendor's model name
   and its prices (USD per million tokens, from the vendor's price list).
   AGENT_MODELS picks which are offered and AGENT_DEFAULT_MODEL the default;
   a model only shows when its provider has a key.

   v1: the cheapest model of each provider. */
export const CHAT_MODELS: readonly ChatModel[] = [
  { id: 'gemini-flash-lite', provider: 'gemini', label: 'Gemini 2.5 Flash-Lite', vendorModel: 'gemini-2.5-flash-lite', inputUsdPerM: 0.1, outputUsdPerM: 0.4 },
  { id: 'gpt-luna', provider: 'openai', label: 'GPT-6 Luna', vendorModel: 'gpt-6-luna', inputUsdPerM: 0.1, outputUsdPerM: 0.5 },
  { id: 'claude-haiku', provider: 'anthropic', label: 'Claude Haiku 5.5', vendorModel: 'claude-haiku-5-5', inputUsdPerM: 0.1, outputUsdPerM: 0.5 },
];

export const DEFAULT_CHAT_MODEL = 'gemini-flash-lite';
