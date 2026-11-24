import type { ChatModel } from './types';

/* The fixed models: Gemini, called directly. Most models come from OpenRouter's
   live list instead (lib/providers/openrouter/models.ts); these are what is
   offered when OpenRouter has no key, and the stand-ins while it is down (see
   fallback.ts). Their IDs match OpenRouter's, so a conversation keeps its
   model whichever way it is reached. Adding one is one entry here: our stable
   ID, its provider (a name in registry.ts), a label, the vendor's model name
   and its prices (USD per million tokens, from the vendor's price list).

   AGENT_MODELS picks which models are offered and AGENT_DEFAULT_MODEL the
   default; AI_FALLBACK_MODEL the stand-in for models Gemini doesn't serve. */
export const CHAT_MODELS: readonly ChatModel[] = [
  { id: 'google/gemini-3.5-flash-lite', provider: 'gemini', label: 'Gemini 3.5 Flash-Lite', vendorModel: 'gemini-3.5-flash-lite', inputUsdPerM: 0.3, outputUsdPerM: 2.5, vendor: 'google', vendorName: 'Google' },
  { id: 'google/gemini-3.5-flash', provider: 'gemini', label: 'Gemini 3.5 Flash', vendorModel: 'gemini-3.5-flash', inputUsdPerM: 1.5, outputUsdPerM: 9, vendor: 'google', vendorName: 'Google' },
];

export const DEFAULT_CHAT_MODEL = 'google/gemini-3.5-flash-lite';

/* The direct Gemini model that answers for a model Gemini doesn't serve. */
export const DEFAULT_FALLBACK_MODEL = 'google/gemini-3.5-flash-lite';

/* Shown first in the model picker, in this order, so the best-known models are
   found without scrolling (AGENT_POPULAR_MODELS replaces the list). IDs not on
   offer are skipped. */
export const POPULAR_MODELS: readonly string[] = [
  'google/gemini-3.5-flash-lite',
  'anthropic/claude-sonnet-5.5',
  'anthropic/claude-haiku-5.5',
  'anthropic/claude-opus-5.5',
  'openai/gpt-6.2-sol',
  'openai/gpt-6-luna',
  'google/gemini-4-neon',
  'x-ai/grok-4.7',
  'deepseek/deepseek-v4.1-flash',
  'qwen/qwen4-max',
];
