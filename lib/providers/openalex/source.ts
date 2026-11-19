import { splitPaperId } from '@/lib/papers/ids';
import { capText } from '@/lib/papers/search/query-length';
import type { Paper } from '@/lib/papers/types';
import { isProviderError } from '../errors';
import type { KeywordQuery, ListQuery, PaperPage, PaperRef, PaperSource, PoolQuery } from '../papers/types';
import type { OpenAlexTransport, QueryParams } from './client';
import { PROVIDER } from './client';
import { QUERY_CHARS_LIMIT, type OpenAlexConfig } from './config';
import { CARD_FIELDS, DETAIL_FIELDS, selectParam } from './fields';
import { toWorkId } from './ids';
import { buildFilter, sortParam } from './filters';
import { toPaper, toPapers } from './mapper';
import type { OpenAlexList, OpenAlexWork } from './types';

/* OpenAlex as a paper source. Every OpenAlex detail (paths, filter syntax,
   field lists, its record format) stays in this folder; callers get Papers. */

/* OpenAlex returns at most 50 results for a search by meaning, unsorted. */
export const SEMANTIC_MAX = 50;
/* IDs or DOIs per list call (filter=doi:a|b|…): far cheaper than one call each. */
export const BATCH = 50;

const pathFor = (ref: PaperRef) =>
  ref.kind === 'id' ? `/works/${ref.id}` : ref.kind === 'doi' ? `/works/doi:${ref.doi}` : `/works/${ref.kind}:${ref.id}`;

export function openAlexSource(transport: OpenAlexTransport, config: Pick<OpenAlexConfig, 'maxQueryChars'>): PaperSource {
  /* One page of `/works`, where OpenAlex filters, sorts and pages. */
  async function works(params: QueryParams): Promise<PaperPage> {
    const { body, costUsd } = await transport.call<OpenAlexList>({ path: '/works', params });
    return { papers: toPapers(body.results), total: Math.max(0, Number(body.meta?.count) || 0), costUsd };
  }

  /* `cited_by:{id}` filters to the paper's referenced_works; `cites:{id}` to papers listing it. */
  const related = (filter: string, q: ListQuery) =>
    works({
      filter: buildFilter(q.filters, 'keyword', [filter]) || undefined,
      sort: sortParam(q.sort),
      page: q.page,
      per_page: q.perPage,
      select: selectParam(CARD_FIELDS),
    });

  async function getPaper(ref: PaperRef): Promise<{ paper: Paper | null; costUsd: number }> {
    try {
      const { body, costUsd } = await transport.call<OpenAlexWork>({ path: pathFor(ref), params: { select: selectParam(DETAIL_FIELDS) } });
      return { paper: toPaper(body), costUsd };
    } catch (e) {
      if (isProviderError(e) && e.code === 'not_found') return { paper: null, costUsd: 0 };
      throw e;
    }
  }

  return {
    name: PROVIDER,
    limits: { maxQueryChars: config.maxQueryChars, semanticMax: SEMANTIC_MAX },

    parseId: (raw) => toWorkId(raw),

    search: (q: KeywordQuery) =>
      works({
        search: q.text,
        filter: q.filters ? buildFilter(q.filters, 'keyword') || undefined : undefined,
        sort: q.sort ? sortParam(q.sort) : undefined,
        page: q.page,
        per_page: q.perPage,
        select: selectParam(CARD_FIELDS),
      }),

    getPaper,

    /* `/works?search.semantic=`, with only the filters semantic search supports. */
    async semanticSearch(q: PoolQuery) {
      const { body, costUsd } = await transport.call<OpenAlexList>({
        path: '/works',
        params: {
          'search.semantic': capText(q.text, QUERY_CHARS_LIMIT),
          filter: buildFilter(q.filters, 'semantic') || undefined,
          per_page: Math.min(q.limit, SEMANTIC_MAX),
          select: selectParam(CARD_FIELDS),
        },
      });
      return { papers: toPapers(body.results), costUsd };
    },

    references: (id, q) => related(`cited_by:${id}`, q),
    citedBy: (id, q) => related(`cites:${id}`, q),

    /* DOIs a filter can't carry (commas, pipes) are looked up one by one, which is free. */
    async getPapers(kind, values) {
      const found = new Map<string, Paper>();
      let costUsd = 0;
      const unique = [...new Set(kind === 'doi' ? values.map((d) => d.toLowerCase()) : values)];
      const safe = unique.filter((v) => !/[,|]/.test(v));
      for (let i = 0; i < safe.length; i += BATCH) {
        const chunk = safe.slice(i, i + BATCH);
        const page = await works({ filter: `${kind === 'doi' ? 'doi' : 'openalex_id'}:${chunk.join('|')}`, per_page: BATCH, select: selectParam(DETAIL_FIELDS) });
        costUsd += page.costUsd;
        for (const p of page.papers) {
          const key = kind === 'doi' ? p.doi : splitPaperId(p.id)?.providerId;
          if (key) found.set(key, p);
        }
      }
      for (const v of unique.filter((x) => /[,|]/.test(x))) {
        const r = await getPaper(kind === 'doi' ? { kind: 'doi', doi: v } : { kind: 'id', id: v });
        costUsd += r.costUsd;
        if (r.paper) found.set(v, r.paper);
      }
      return { found, costUsd };
    },
  };
}
