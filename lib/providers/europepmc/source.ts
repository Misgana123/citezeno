import type { Paper } from '@/lib/papers/types';
import { cursorPage } from '../papers/cursor';
import type { ScholarlyTransport } from '../papers/http';
import type { KeywordQuery, PaperPage, PaperRef, PaperSource } from '../papers/types';
import { splitEpmcId, toEpmcId } from './ids';
import { PROVIDER, toPapers } from './mapper';
import { searchQuery, sortParam } from './query';
import type { EpmcSearch } from './types';

/* Europe PMC as a paper source: one search call gives full records with
   abstracts and citation counts. It pages with a cursor, so page N walks the
   cursors before it (cached). Every Europe PMC detail stays in this folder. */

export const MAX_QUERY_CHARS = 1500;
const BATCH = 25;

export function epmcSource(transport: ScholarlyTransport): PaperSource {
  async function search(query: string, opts: { pageSize: number; cursor?: string | null; sort?: string }) {
    const { body } = await transport.call<EpmcSearch>({
      path: '/search',
      params: { query, format: 'json', resultType: 'core', pageSize: opts.pageSize, cursorMark: opts.cursor ?? '*', sort: opts.sort },
    });
    const next = body.nextCursorMark && body.nextCursorMark !== (opts.cursor ?? '*') ? body.nextCursorMark : null;
    return { items: toPapers(body.resultList?.result), total: Math.max(0, Number(body.hitCount) || 0), next };
  }

  const one = async (query: string) => (await search(query, { pageSize: 1 })).items[0] ?? null;

  function refQuery(ref: PaperRef): string | null {
    if (ref.kind === 'doi') return `DOI:"${ref.doi.replace(/"/g, '')}"`;
    if (ref.kind === 'pmcid') return `PMCID:${ref.id.replace(/[^\w]/g, '')}`;
    const id = toEpmcId(ref.kind === 'pmid' ? `MED:${ref.id}` : ref.id);
    if (!id) return null;
    const { source, ext } = splitEpmcId(id);
    return source === 'PMC' ? `PMCID:${ext}` : `EXT_ID:${ext} AND SRC:${source}`;
  }

  return {
    name: PROVIDER,
    limits: { maxQueryChars: MAX_QUERY_CHARS, semanticMax: 0 },
    parseId: (raw) => toEpmcId(raw),

    async search(q: KeywordQuery): Promise<PaperPage> {
      const query = searchQuery(q.text, q.filters);
      if (!query) return { papers: [], total: 0, costUsd: 0 };
      const sort = sortParam(q.sort);
      const r = await cursorPage(q.page ?? 1, (cursor) => search(query, { pageSize: q.perPage, cursor, sort }));
      return { papers: r.items, total: r.total, costUsd: 0 };
    },

    async getPaper(ref) {
      const query = refQuery(ref);
      return { paper: query ? await one(query) : null, costUsd: 0 };
    },

    async getPapers(kind, values) {
      const found = new Map<string, Paper>();
      const unique = [...new Set(kind === 'doi' ? values.map((d) => d.toLowerCase()) : values)];
      for (let i = 0; i < unique.length; i += BATCH) {
        const chunk = unique.slice(i, i + BATCH);
        const queries = chunk.map((v) => refQuery(kind === 'doi' ? { kind: 'doi', doi: v } : { kind: 'id', id: v })).filter(Boolean);
        if (!queries.length) continue;
        const { items } = await search(queries.map((x) => `(${x})`).join(' OR '), { pageSize: chunk.length * 2 });
        for (const p of items) {
          if (kind === 'doi' && p.doi && chunk.includes(p.doi)) found.set(p.doi, p);
          if (kind === 'id') {
            const own = p.id.slice(PROVIDER.length + 1);
            const asked = chunk.find((v) => toEpmcId(v) === own);
            if (asked) found.set(asked, p);
          }
        }
      }
      return { found, costUsd: 0 };
    },
  };
}
