import { scholarlyPolicy, scholarlyTransport, type HttpSettings } from '../papers/http';
import type { PaperProviderDefinition } from '../papers/types';
import { pubmedConfig } from './config';
import { PROVIDER } from './mapper';
import { MAX_QUERY_CHARS, pubmedSource } from './source';

/* PubMed, registered as a paper data provider. Free; NCBI_API_KEY is optional.
   Used only when listed in PAPER_PROVIDERS. Its searches (JSON) and records
   (XML) share one waiting line and one breaker: same provider name. */
export const pubmedProvider: PaperProviderDefinition = {
  name: PROVIDER,
  limits: () => ({ maxQueryChars: MAX_QUERY_CHARS, semanticMax: 0 }),
  create(env, gate) {
    const c = pubmedConfig(env);
    const http: Omit<HttpSettings, 'format'> = {
      provider: PROVIDER,
      label: 'PubMed',
      baseUrl: c.baseUrl,
      timeoutMs: c.timeoutMs,
      userAgent: c.userAgent,
      params: { tool: 'citezeno', email: c.contactEmail ?? undefined, api_key: c.apiKey ?? undefined },
    };
    const policy = scholarlyPolicy({ provider: PROVIDER, label: 'PubMed', basics: c, ratePerS: c.ratePerS, concurrency: 4, isRecord: (r) => r.path === '/efetch.fcgi' });
    return pubmedSource(gate(scholarlyTransport({ ...http, format: 'json' }), policy), gate(scholarlyTransport({ ...http, format: 'xml' }), policy));
  },
};
