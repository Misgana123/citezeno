import type { Paper } from '@/lib/papers/types';
import { cursorPage } from '../papers/cursor';
import type { QueryParams, ScholarlyTransport } from '../papers/http';
import { searchWords } from '../papers/parse';
import type { KeywordQuery, PaperFilters, PaperPage, PaperSource } from '../papers/types';
import { toNctId } from './ids';
import { FIELDS, PROVIDER, toPaper, toPapers } from './mapper';
import type { CtSearch, CtStudy } from './types';

/* ClinicalTrials.gov as a paper source: registered clinical trials, as
   papers of type "other". It pages with a token, so page N walks the tokens
   before it (cached). Every ClinicalTrials.gov detail stays in this folder. */

export const MAX_QUERY_CHARS = 1500;
const BATCH = 50;
const FEW_WORDS = 4;

/* A few key words must all match; a longer passage matches any of them (best first). */
export function searchTerm(text: string): string {
  const words = searchWords(text, 12);
  return words.length <= FEW_WORDS ? words.join(' ') : words.join(' OR ');
}

/* Filters → its parameters; null when they rule trials out (they are English
   registry records without citations, of no publication type we list). */
export function filterParams(f?: PaperFilters): QueryParams | null {
  if (!f) return {};
  if (f.types.length && !f.types.includes('other')) return null;
  if (f.language && f.language !== 'en') return null;
  if (f.minCitations != null && f.minCitations > 0) return null;
  if (f.yearFrom == null && f.yearTo == null) return {};
  return { 'filter.advanced': `AREA[StartDate]RANGE[${f.yearFrom != null ? `${f.yearFrom}-01-01` : 'MIN'},${f.yearTo != null ? `${f.yearTo}-12-31` : 'MAX'}]` };
}

export function ctSource(transport: ScholarlyTransport): PaperSource {
  async function studies(params: QueryParams, pageSize: number, token: string | null) {
    const { body } = await transport.call<CtSearch>({ path: '/studies', params: { ...params, fields: FIELDS, pageSize, pageToken: token ?? undefined, countTotal: 'true' } });
    return { items: toPapers(body.studies), total: Math.max(0, Number(body.totalCount) || 0), next: body.nextPageToken ?? null };
  }

  async function byIds(ids: string[]): Promise<Paper[]> {
    const out: Paper[] = [];
    for (let i = 0; i < ids.length; i += BATCH) {
      const chunk = ids.slice(i, i + BATCH);
      out.push(...(await studies({ 'filter.ids': chunk.join(',') }, chunk.length, null)).items);
    }
    return out;
  }

  return {
    name: PROVIDER,
    limits: { maxQueryChars: MAX_QUERY_CHARS, semanticMax: 0 },
    parseId: (raw) => toNctId(raw),

    async search(q: KeywordQuery): Promise<PaperPage> {
      const filters = filterParams(q.filters);
      const term = searchTerm(q.text);
      if (!filters || !term) return { papers: [], total: 0, costUsd: 0 };
      const params = { 'query.term': term, ...filters, sort: q.sort === 'newest' ? 'StartDate:desc' : undefined };
      const r = await cursorPage(q.page ?? 1, (token) => studies(params, q.perPage, token));
      return { papers: r.items, total: r.total, costUsd: 0 };
    },

    async getPaper(ref) {
      const nct = ref.kind === 'id' ? toNctId(ref.id) : null;
      if (!nct) return { paper: null, costUsd: 0 };
      try {
        const { body } = await transport.call<CtStudy>({ path: `/studies/${nct}`, params: { fields: FIELDS } });
        return { paper: toPaper(body), costUsd: 0 };
      } catch (e) {
        if ((e as { code?: string })?.code === 'not_found') return { paper: null, costUsd: 0 };
        throw e;
      }
    },

    async getPapers(kind, values) {
      const found = new Map<string, Paper>();
      if (kind !== 'id') return { found, costUsd: 0 }; // trials have no DOIs
      const wanted = new Map(values.map((v) => [toNctId(v), v] as const).filter((x): x is [string, string] => !!x[0]));
      for (const p of await byIds([...wanted.keys()])) {
        const asked = wanted.get(p.id.slice(PROVIDER.length + 1));
        if (asked) found.set(asked, p);
      }
      return { found, costUsd: 0 };
    },
  };
}
