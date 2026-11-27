import { scholarlyPolicy, scholarlyTransport } from '../papers/http';
import type { PaperProviderDefinition } from '../papers/types';
import { epmcConfig } from './config';
import { PROVIDER } from './mapper';
import { epmcSource, MAX_QUERY_CHARS } from './source';

/* Europe PMC, registered as a paper data provider. Free and keyless; used only
   when listed in PAPER_PROVIDERS. */
export const europePmcProvider: PaperProviderDefinition = {
  name: PROVIDER,
  limits: () => ({ maxQueryChars: MAX_QUERY_CHARS, semanticMax: 0 }),
  create(env, gate) {
    const c = epmcConfig(env);
    const transport = scholarlyTransport({ provider: PROVIDER, label: 'Europe PMC', baseUrl: c.baseUrl, timeoutMs: c.timeoutMs, userAgent: c.userAgent, format: 'json' });
    // single records (looked up by ID or DOI) keep for the paper cache time
    const policy = scholarlyPolicy({ provider: PROVIDER, label: 'Europe PMC', basics: c, ratePerS: c.ratePerS, concurrency: 6, isRecord: (r) => /^(\(?(EXT_ID|DOI|PMCID):)/.test(String(r.params?.query ?? '')) });
    return epmcSource(gate(transport, policy));
  },
};
