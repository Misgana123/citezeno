import { scholarlyPolicy, scholarlyTransport } from '../papers/http';
import type { PaperProviderDefinition } from '../papers/types';
import { ctConfig } from './config';
import { PROVIDER } from './mapper';
import { ctSource, MAX_QUERY_CHARS } from './source';

/* ClinicalTrials.gov, registered as a paper data provider. Free and keyless;
   used only when listed in PAPER_PROVIDERS. */
export const clinicalTrialsProvider: PaperProviderDefinition = {
  name: PROVIDER,
  limits: () => ({ maxQueryChars: MAX_QUERY_CHARS, semanticMax: 0 }),
  create(env, gate) {
    const c = ctConfig(env);
    const transport = scholarlyTransport({ provider: PROVIDER, label: 'ClinicalTrials.gov', baseUrl: c.baseUrl, timeoutMs: c.timeoutMs, userAgent: c.userAgent, format: 'json' });
    const policy = scholarlyPolicy({ provider: PROVIDER, label: 'ClinicalTrials.gov', basics: c, ratePerS: c.ratePerS, concurrency: 2, isRecord: (r) => r.path !== '/studies' || r.params?.['filter.ids'] != null });
    return ctSource(gate(transport, policy));
  },
};
