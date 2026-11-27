import { toDoi, toOrcid } from '@/lib/papers/ids';
import type { EnricherDefinition, PaperPatch } from '../enrich/types';
import { rateFrom, scholarlyBasics, scholarlyPolicy, scholarlyTransport, type ScholarlyTransport } from '../papers/http';
import { clean, dateParts, plain } from '../papers/parse';

/* Crossref: the publisher's own record for a DOI. Fills a missing abstract,
   authors (with ORCIDs), date, journal, citation count, an open license, and
   retraction notices. (Its PDF links are mostly for subscribers, so they are
   not used.) Free; with our contact email we are in its "polite" pool.

     CROSSREF_RATE_PER_S   calls per second, shared by every server instance
                           (default 2.5 with PROVIDER_CONTACT_EMAIL, 0.9 without:
                           Crossref allows 3 / 1 list calls a second) */

export const PROVIDER = 'crossref';
const LABEL = 'Crossref';
const BATCH = 20;
const SELECT = 'DOI,title,abstract,author,issued,container-title,type,is-referenced-by-count,license,updated-by';

type Item = {
  DOI?: string;
  title?: string[];
  abstract?: string;
  author?: { given?: string; family?: string; name?: string; ORCID?: string }[];
  issued?: { 'date-parts'?: (number | null)[][] };
  'container-title'?: string[];
  type?: string;
  'is-referenced-by-count'?: number;
  license?: { URL?: string }[];
  'updated-by'?: { type?: string }[];
};

const TYPES: Record<string, string> = { 'journal-article': 'article', 'posted-content': 'preprint', book: 'book', 'book-chapter': 'book-chapter', dataset: 'dataset', dissertation: 'dissertation', report: 'report', standard: 'standard' };

/* "https://creativecommons.org/licenses/by-nc/4.0/" → "cc-by-nc"; other licenses aren't "open". */
function openLicense(items: Item['license']): string | null {
  for (const l of items ?? []) {
    const m = l.URL?.match(/creativecommons\.org\/(licenses\/([a-z-]+)|publicdomain\/zero)/i);
    if (m) return m[2] ? `cc-${m[2].toLowerCase()}` : 'cc0';
  }
  return null;
}

export function toPatch(it: Item): PaperPatch {
  const parts = it.issued?.['date-parts']?.[0]?.filter((n): n is number => typeof n === 'number') ?? [];
  const { year, date } = dateParts(parts.map((n, i) => (i ? String(n).padStart(2, '0') : String(n))).join('-'));
  const license = openLicense(it.license);
  return {
    title: plain(it.title?.[0]) ?? undefined,
    authors: (it.author ?? [])
      .map((a) => ({ name: clean(a.name) ?? clean([a.given, a.family].filter(Boolean).join(' ')), orcid: toOrcid(a.ORCID) }))
      .filter((a): a is { name: string; orcid: string | null } => !!a.name),
    year,
    publicationDate: date,
    source: plain(it['container-title']?.[0]),
    type: (it.type && TYPES[it.type]) ?? null,
    abstract: plain(it.abstract)?.replace(/^abstract\s*/i, '') || null,
    citedByCount: Math.max(0, Number(it['is-referenced-by-count']) || 0),
    license,
    isOpenAccess: license != null,
    isRetracted: (it['updated-by'] ?? []).some((u) => /retraction/i.test(u.type ?? '')),
  };
}

export function crossrefLookup(transport: ScholarlyTransport) {
  return async (dois: string[]) => {
    const out = new Map<string, PaperPatch>();
    const unique = [...new Set(dois.map((d) => toDoi(d)).filter((d): d is string => !!d && !d.includes(',')))];
    for (let i = 0; i < unique.length; i += BATCH) {
      const chunk = unique.slice(i, i + BATCH);
      const { body } = await transport.call<{ message?: { items?: Item[] } }>({ path: '/works', params: { filter: chunk.map((d) => `doi:${d}`).join(','), rows: chunk.length, select: SELECT } });
      for (const it of body.message?.items ?? []) {
        const doi = toDoi(it.DOI);
        if (doi && chunk.includes(doi)) out.set(doi, toPatch(it));
      }
    }
    return out;
  };
}

export const crossrefEnricher: EnricherDefinition = {
  name: PROVIDER,
  create(env, gate) {
    const basics = scholarlyBasics(env);
    const polite = basics.contactEmail != null;
    const transport = scholarlyTransport({
      provider: PROVIDER,
      label: LABEL,
      baseUrl: 'https://api.crossref.org',
      timeoutMs: basics.timeoutMs,
      userAgent: basics.userAgent,
      format: 'json',
      params: polite ? { mailto: basics.contactEmail } : undefined,
    });
    const policy = scholarlyPolicy({ provider: PROVIDER, label: LABEL, basics, ratePerS: rateFrom(env.CROSSREF_RATE_PER_S, polite ? 2.5 : 0.9, polite ? 3 : 1), concurrency: 2, isRecord: () => true });
    return { name: PROVIDER, fills: ['abstract', 'authors', 'year', 'publicationDate', 'source', 'type', 'citedByCount', 'license', 'isRetracted'], lookup: crossrefLookup(gate(transport, policy)) };
  },
};
