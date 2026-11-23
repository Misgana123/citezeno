import type { Paper } from '@/lib/papers/types';
import type { KeywordQuery, PaperPage, PaperRef, PaperSource } from '../papers/types';
import type { ScholarlyTransport } from '../papers/http';
import { toPmid } from './ids';
import { fromFetch, PROVIDER } from './mapper';
import { searchTerm, sortParam } from './query';

/* PubMed as a paper source: esearch finds the PMIDs, efetch brings the records
   (with abstracts and reference lists). Every PubMed detail stays in this folder. */

export const MAX_QUERY_CHARS = 1500;
const FETCH_BATCH = 200;
const DOI_BATCH = 50;

type SearchAnswer = { esearchresult?: { count?: string; idlist?: string[]; ERROR?: string } };

export function pubmedSource(json: ScholarlyTransport, xml: ScholarlyTransport): PaperSource {
  async function esearch(term: string, opts: { start?: number; max: number; sort?: string }) {
    const { body } = await json.call<SearchAnswer>({ path: '/esearch.fcgi', params: { db: 'pubmed', term, retstart: opts.start ?? 0, retmax: opts.max, sort: opts.sort, retmode: 'json' } });
    const r = body.esearchresult ?? {};
    return { ids: (r.idlist ?? []).filter((id) => toPmid(id)), total: Math.max(0, Number(r.count) || 0) };
  }

  async function efetch(pmids: string[]): Promise<Paper[]> {
    const out: Paper[] = [];
    for (let i = 0; i < pmids.length; i += FETCH_BATCH) {
      const chunk = pmids.slice(i, i + FETCH_BATCH);
      out.push(...fromFetch((await xml.call<string>({ path: '/efetch.fcgi', params: { db: 'pubmed', id: chunk.join(','), retmode: 'xml' } })).body));
    }
    // efetch returns records in its own order: put them back in the order asked
    const order = new Map(pmids.map((id, i) => [id, i]));
    return out.sort((a, b) => (order.get(a.id.slice(PROVIDER.length + 1)) ?? 0) - (order.get(b.id.slice(PROVIDER.length + 1)) ?? 0));
  }

  async function idsFor(ref: PaperRef): Promise<string[]> {
    if (ref.kind === 'id' || ref.kind === 'pmid') {
      const pmid = toPmid(ref.id);
      return pmid ? [pmid] : [];
    }
    if (ref.kind === 'doi') return (await esearch(`"${ref.doi.replace(/"/g, '')}"[doi]`, { max: 1 })).ids;
    return (await esearch(`${ref.id.replace(/[^\w]/g, '')}[pmc]`, { max: 1 })).ids;
  }

  return {
    name: PROVIDER,
    limits: { maxQueryChars: MAX_QUERY_CHARS, semanticMax: 0 },
    parseId: (raw) => toPmid(raw),

    async search(q: KeywordQuery): Promise<PaperPage> {
      const term = searchTerm(q.text, q.filters);
      if (!term) return { papers: [], total: 0, costUsd: 0 };
      const { ids, total } = await esearch(term, { start: ((q.page ?? 1) - 1) * q.perPage, max: q.perPage, sort: sortParam(q.sort) });
      return { papers: ids.length ? await efetch(ids) : [], total, costUsd: 0 };
    },

    async getPaper(ref) {
      const ids = await idsFor(ref);
      const [paper] = ids.length ? await efetch(ids.slice(0, 1)) : [];
      return { paper: paper ?? null, costUsd: 0 };
    },

    async getPapers(kind, values) {
      const found = new Map<string, Paper>();
      if (kind === 'id') {
        const pmids = [...new Set(values.map(toPmid).filter((p): p is string => !!p))];
        for (const p of await efetch(pmids)) found.set(p.id.slice(PROVIDER.length + 1), p);
        return { found, costUsd: 0 };
      }
      const dois = [...new Set(values.map((d) => d.toLowerCase().replace(/"/g, '')))];
      for (let i = 0; i < dois.length; i += DOI_BATCH) {
        const chunk = dois.slice(i, i + DOI_BATCH);
        const { ids } = await esearch(chunk.map((d) => `"${d}"[doi]`).join(' OR '), { max: chunk.length * 2 });
        for (const p of await efetch(ids)) if (p.doi && chunk.includes(p.doi)) found.set(p.doi, p);
      }
      return { found, costUsd: 0 };
    },
  };
}
