import { scholarlyPolicy, scholarlyTransport } from '../papers/http';
import type { PaperProviderDefinition } from '../papers/types';
import { arxivConfig } from './config';
import { PROVIDER } from './mapper';
import { arxivSource, MAX_QUERY_CHARS } from './source';

/* arXiv, registered as a paper data provider. Free and keyless, so always
   available; it is used only when listed in PAPER_PROVIDERS. arXiv allows one
   call at a time, every 3 seconds, across all our servers. */
export const arxivProvider: PaperProviderDefinition = {
  name: PROVIDER,
  limits: () => ({ maxQueryChars: MAX_QUERY_CHARS, semanticMax: 0 }),
  create(env, gate) {
    const c = arxivConfig(env);
    const transport = scholarlyTransport({ provider: PROVIDER, label: 'arXiv', baseUrl: c.baseUrl, timeoutMs: c.timeoutMs, userAgent: c.userAgent, format: 'xml' });
    const policy = scholarlyPolicy({ provider: PROVIDER, label: 'arXiv', basics: c, ratePerS: c.ratePerS, concurrency: 1, isRecord: (r) => r.params?.id_list != null });
    return arxivSource(gate(transport, policy));
  },
};
