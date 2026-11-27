import { tavilyProvider } from '../tavily';
import type { ProviderDefinition } from '../types';
import type { WebSearch } from './types';

/* Every web search provider. To add one: implement WebSearch in
   lib/providers/<name>/, add it here, and set WEB_SEARCH_PROVIDER. */
export const WEB_SEARCH_PROVIDERS: Readonly<Record<string, ProviderDefinition<WebSearch>>> = { [tavilyProvider.name]: tavilyProvider };

export const DEFAULT_WEB_SEARCH = [tavilyProvider.name];
