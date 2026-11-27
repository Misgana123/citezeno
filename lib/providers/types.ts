import type { GatewayPolicy, Transport } from './gateway/types';

/* How a provider plugs in. Each job (paper data, file storage, PDF text…) has
   its own interface; a provider is one adapter that implements it, registered
   under a name in that job's registry. */

export type Env = Record<string, string | undefined>;

/* Routes a provider's raw transport through the gateway (cache, cost log,
   limits, retries). Adapters make every outside call through what this returns. */
export type Gate = <Req>(transport: Transport<Req>, policy: GatewayPolicy<Req>) => Transport<Req>;

export type ProviderDefinition<Api> = {
  readonly name: string;
  /* Build the provider from configuration, or null when it isn't configured
     (say, a missing key). Remote providers must wire their transport through `gate`. */
  create(env: Env, gate: Gate): Api | null;
};
