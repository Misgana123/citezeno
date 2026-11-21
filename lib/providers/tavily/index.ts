import type { ProviderDefinition } from '../types';
import type { WebSearch } from '../web-search/types';
import { createTavily, PROVIDER } from './search';

/* Tavily, registered as a web search provider. Not configured (no key) → null. */
export const tavilyProvider: ProviderDefinition<WebSearch> = { name: PROVIDER, create: (env, gate) => createTavily(env, gate) };
