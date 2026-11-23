import { toDoi } from '@/lib/papers/ids';
import type { EnricherDefinition, PaperPatch } from '../enrich/types';
import { scholarlyPolicy, scholarlyTransport, type ScholarlyTransport } from '../papers/http';
import { clean, plain } from '../papers/parse';
import { s2Config } from './config';
import { PROVIDER } from './mapper';
import type { S2Paper } from './types';

/* Semantic Scholar as a filler of gaps: for DOIs, its abstract, free PDF link
   and citation count (one batch call per 500 DOIs). Needs S2_API_KEY. */

const BATCH = 500;
const FIELDS = 'externalIds,abstract,citationCount,isOpenAccess,openAccessPdf';

export function s2Lookup(transport: ScholarlyTransport) {
  return async (dois: string[]) => {
    const out = new Map<string, PaperPatch>();
    const unique = [...new Set(dois.map((d) => toDoi(d)).filter((d): d is string => !!d))];
    for (let i = 0; i < unique.length; i += BATCH) {
      const chunk = unique.slice(i, i + BATCH);
      const { body } = await transport.call<(S2Paper | null)[]>({ path: '/graph/v1/paper/batch', params: { fields: FIELDS }, body: { ids: chunk.map((d) => `DOI:${d}`) } });
      (Array.isArray(body) ? body : []).forEach((p, j) => {
        if (!p || !chunk[j]) return;
        out.set(chunk[j], {
          abstract: plain(p.abstract),
          citedByCount: Math.max(0, Number(p.citationCount) || 0),
          isOpenAccess: p.isOpenAccess === true,
          pdfUrl: clean(p.openAccessPdf?.url),
          license: clean(p.openAccessPdf?.license)?.toLowerCase() ?? null,
        });
      });
    }
    return out;
  };
}

export const semanticScholarEnricher: EnricherDefinition = {
  name: PROVIDER,
  create(env, gate) {
    const c = s2Config(env);
    if (!c.apiKey) return null;
    const transport = scholarlyTransport({ provider: PROVIDER, label: 'Semantic Scholar', baseUrl: c.baseUrl, timeoutMs: c.timeoutMs, userAgent: c.userAgent, format: 'json', headers: { 'x-api-key': c.apiKey } });
    const policy = scholarlyPolicy({ provider: PROVIDER, label: 'Semantic Scholar', basics: c, ratePerS: c.ratePerS, concurrency: 4, isRecord: () => true });
    return { name: PROVIDER, fills: ['abstract', 'pdfUrl', 'license', 'citedByCount'], lookup: s2Lookup(gate(transport, policy)) };
  },
};
