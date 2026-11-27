import { toDoi } from '@/lib/papers/ids';
import { isProviderError } from '../errors';
import type { EnricherDefinition, PaperPatch } from '../enrich/types';
import { rateFrom, scholarlyBasics, scholarlyPolicy, scholarlyTransport, type ScholarlyTransport } from '../papers/http';
import { clean } from '../papers/parse';

/* Unpaywall: for a DOI, the best free (open access) copy of the paper, its
   PDF link and license. Free; it needs our contact email (PROVIDER_CONTACT_EMAIL)
   and allows 100,000 calls a day, one DOI per call.

     UNPAYWALL_RATE_PER_S     calls per second, shared by every server instance (default 5)
     UNPAYWALL_DAILY_CALLS    our own daily cap, below Unpaywall's 100,000 (default 90000) */

export const PROVIDER = 'unpaywall';
const LABEL = 'Unpaywall';

type Answer = { doi?: string; is_oa?: boolean; best_oa_location?: { url_for_pdf?: string | null; license?: string | null } | null };

export function toPatch(a: Answer): PaperPatch {
  const best = a.best_oa_location;
  return { isOpenAccess: a.is_oa === true, pdfUrl: clean(best?.url_for_pdf), license: clean(best?.license)?.toLowerCase() ?? null };
}

export function unpaywallLookup(transport: ScholarlyTransport) {
  return async (dois: string[]) => {
    const out = new Map<string, PaperPatch>();
    for (const raw of new Set(dois.map((d) => toDoi(d)).filter((d): d is string => !!d))) {
      try {
        const { body } = await transport.call<Answer>({ path: `/v2/${encodeURIComponent(raw)}` });
        out.set(raw, toPatch(body));
      } catch (e) {
        if (isProviderError(e) && e.code === 'not_found') continue; // a DOI Unpaywall doesn't know
        throw e;
      }
    }
    return out;
  };
}

export const unpaywallEnricher: EnricherDefinition = {
  name: PROVIDER,
  create(env, gate) {
    const basics = scholarlyBasics(env);
    if (!basics.contactEmail) return null;
    const cap = Number(env.UNPAYWALL_DAILY_CALLS);
    const transport = scholarlyTransport({ provider: PROVIDER, label: LABEL, baseUrl: 'https://api.unpaywall.org', timeoutMs: basics.timeoutMs, userAgent: basics.userAgent, format: 'json', params: { email: basics.contactEmail } });
    const policy = {
      ...scholarlyPolicy({ provider: PROVIDER, label: LABEL, basics, ratePerS: rateFrom(env.UNPAYWALL_RATE_PER_S, 5, 10), concurrency: 4, isRecord: () => true }),
      dailyCalls: { cap: Number.isFinite(cap) && cap > 0 ? Math.min(100_000, Math.floor(cap)) : 90_000, configHint: 'UNPAYWALL_DAILY_CALLS' },
    };
    return { name: PROVIDER, fills: ['isOpenAccess', 'pdfUrl', 'license'], lookup: unpaywallLookup(gate(transport, policy)) };
  },
};
