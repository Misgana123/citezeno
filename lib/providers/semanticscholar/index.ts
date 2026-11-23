import { scholarlyPolicy, scholarlyTransport } from '../papers/http';
import type { PaperProviderDefinition } from '../papers/types';
import { s2Config } from './config';
import { PROVIDER } from './mapper';
import { MAX_QUERY_CHARS, s2Source } from './source';

/* Semantic Scholar, registered as a paper data provider. It needs S2_API_KEY
   (without one, it is left out) and is used only when listed in PAPER_PROVIDERS. */
export const semanticScholarProvider: PaperProviderDefinition = {
  name: PROVIDER,
  limits: () => ({ maxQueryChars: MAX_QUERY_CHARS, semanticMax: 0 }),
  create(env, gate) {
    const c = s2Config(env);
    if (!c.apiKey) return null;
    const transport = scholarlyTransport({ provider: PROVIDER, label: 'Semantic Scholar', baseUrl: c.baseUrl, timeoutMs: c.timeoutMs, userAgent: c.userAgent, format: 'json', headers: { 'x-api-key': c.apiKey } });
    const policy = scholarlyPolicy({ provider: PROVIDER, label: 'Semantic Scholar', basics: c, ratePerS: c.ratePerS, concurrency: 4, isRecord: (r) => !r.path.endsWith('/search') });
    return s2Source(gate(transport, policy));
  },
};
