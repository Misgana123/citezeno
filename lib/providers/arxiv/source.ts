import type { Paper } from '@/lib/papers/types';
import type { BrowseQuery, KeywordQuery, PaperPage, PaperRef, PaperSource } from '../papers/types';
import type { ScholarlyTransport } from '../papers/http';
import { toArxivId } from './ids';
import { fromFeed, PROVIDER } from './mapper';
import { searchQuery, sortParams } from './query';

/* arXiv as a paper source (search, single papers, batches by ID). Every arXiv
   detail stays in this folder; callers get Papers. No semantic search,
   references or citation counts. */

export const BATCH = 50;
/* arXiv serves at most 2,000 results a call and 30,000 into one listing. */
export const BROWSE_MAX_PER_PAGE = 200;
export const BROWSE_MAX_DEPTH = 30_000;
export const MAX_QUERY_CHARS = 1500;

export function arxivSource(transport: ScholarlyTransport): PaperSource {
  const feed = async (params: Record<string, string | number>) => fromFeed((await transport.call<string>({ path: '/query', params })).body);

  async function byIds(ids: string[]): Promise<Paper[]> {
    const out: Paper[] = [];
    for (let i = 0; i < ids.length; i += BATCH) {
      const chunk = ids.slice(i, i + BATCH);
      out.push(...(await feed({ id_list: chunk.join(','), max_results: chunk.length })).papers);
    }
    return out;
  }

  /* A DOI points at an arXiv paper only when it is arXiv's own (10.48550/arxiv.…). */
  const idFor = (ref: PaperRef) => (ref.kind === 'id' ? toArxivId(ref.id) : ref.kind === 'doi' && /^10\.48550\/arxiv\./i.test(ref.doi) ? toArxivId(ref.doi) : null);

  return {
    name: PROVIDER,
    limits: { maxQueryChars: MAX_QUERY_CHARS, semanticMax: 0 },
    parseId: (raw) => toArxivId(raw),

    async search(q: KeywordQuery): Promise<PaperPage> {
      const query = searchQuery(q.text, q.filters);
      if (!query) return { papers: [], total: 0, costUsd: 0 };
      const { papers, total } = await feed({ search_query: query, start: ((q.page ?? 1) - 1) * q.perPage, max_results: q.perPage, ...sortParams(q.sort) });
      return { papers, total, costUsd: 0 };
    },

    /* The newest papers (arXiv has no citation counts, so "cited" lists newest too), by offset. */
    async browse(q: BrowseQuery) {
      const start = Number(q.cursor ?? 0) || 0;
      const perPage = Math.min(q.perPage, BROWSE_MAX_PER_PAGE, BROWSE_MAX_DEPTH - start);
      if (perPage <= 0) return { papers: [], next: null, costUsd: 0 };
      const { papers } = await feed({ search_query: `submittedDate:[${q.sinceYear ?? 1991}01010000 TO 999912312359]`, start, max_results: perPage, sortBy: 'submittedDate', sortOrder: 'descending' });
      const next = papers.length >= perPage && start + perPage < BROWSE_MAX_DEPTH ? String(start + perPage) : null;
      return { papers, next, costUsd: 0 };
    },

    async getPaper(ref) {
      const id = idFor(ref);
      if (!id) return { paper: null, costUsd: 0 };
      const [paper] = await byIds([id]);
      return { paper: paper ?? null, costUsd: 0 };
    },

    async getPapers(kind, values) {
      const wanted = new Map<string, string>(); // arXiv ID → the value asked for
      for (const v of values) {
        const id = kind === 'id' ? toArxivId(v) : /^10\.48550\/arxiv\./i.test(v) ? toArxivId(v) : null;
        if (id) wanted.set(id, kind === 'doi' ? v.toLowerCase() : v);
      }
      const found = new Map<string, Paper>();
      for (const p of await byIds([...wanted.keys()])) {
        const key = wanted.get(p.id.slice(PROVIDER.length + 1));
        if (key) found.set(key, p);
      }
      return { found, costUsd: 0 };
    },
  };
}
