import type { ProviderDefinition } from '../types';
import type { WebFiles } from '../web-files/types';
import { directHttp, PROVIDER } from './fetch';

/* Fetching open-access files straight from the sites that host them, through the gateway. */
export const directHttpProvider: ProviderDefinition<WebFiles> = {
  name: PROVIDER,
  create: (_env, gate) => directHttp({ gate }),
};
