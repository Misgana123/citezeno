import { toDoi } from '@/lib/papers/ids';
import { isProviderError } from '../errors';
import type { EnricherDefinition, PaperPatch } from '../enrich/types';
import { rateFrom, scholarlyBasics, scholarlyPolicy, scholarlyTransport, type ScholarlyTransport } from '../papers/http';
import { clean } from '../papers/parse';

/* CORE: free full texts gathered from repositories worldwide. For a DOI, its
   "discover" service gives a link to a free full text, when one exists. Needs
   a free key (CORE_API_KEY, from core.ac.uk/services/api).

     CORE_RATE_PER_S   calls per second, shared by every server instance (default 0.2) */

export const PROVIDER = 'core';
const LABEL = 'CORE';

type Answer = { fullTextLink?: string | null };

export function coreLookup(transport: ScholarlyTransport) {
  return async (dois: string[]) => {
    const out = new Map<string, PaperPatch>();
    for (const doi of new Set(dois.map((d) => toDoi(d)).filter((d): d is string => !!d))) {
      try {
        const { body } = await transport.call<Answer>({ path: '/v3/discover', body: { doi } });
        const link = clean(body.fullTextLink);
        if (link && /^https?:\/\//.test(link)) out.set(doi, { pdfUrl: link, isOpenAccess: true });
      } catch (e) {
        if (isProviderError(e) && e.code === 'not_found') continue;
        throw e;
      }
    }
    return out;
  };
}

export const coreEnricher: EnricherDefinition = {
  name: PROVIDER,
  create(env, gate) {
    const key = env.CORE_API_KEY?.trim();
    if (!key) return null;
    const basics = scholarlyBasics(env);
    const transport = scholarlyTransport({ provider: PROVIDER, label: LABEL, baseUrl: 'https://api.core.ac.uk', timeoutMs: basics.timeoutMs, userAgent: basics.userAgent, format: 'json', headers: { authorization: `Bearer ${key}` } });
    const policy = scholarlyPolicy({ provider: PROVIDER, label: LABEL, basics, ratePerS: rateFrom(env.CORE_RATE_PER_S, 0.2, 10), concurrency: 1, isRecord: () => true });
    return { name: PROVIDER, fills: ['pdfUrl'], lookup: coreLookup(gate(transport, policy)) };
  },
};
