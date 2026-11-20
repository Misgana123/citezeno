import { directHttpProvider } from '../direct-http';
import type { ProviderDefinition } from '../types';
import type { WebFiles } from './types';

/* Every web files provider (a fetching proxy service could be another). */
export const WEB_FILES_PROVIDERS: Readonly<Record<string, ProviderDefinition<WebFiles>>> = {
  [directHttpProvider.name]: directHttpProvider,
};

export const DEFAULT_WEB_FILES = [directHttpProvider.name];
