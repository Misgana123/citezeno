import type { Paper } from '@/lib/papers/types';
import type { ScholarlyTransport } from '../papers/http';
import { searchWords } from '../papers/parse';
import type { KeywordQuery, PaperPage, PaperRef, PaperSource } from '../papers/types';
import { toS2Id } from './ids';
import { FIELDS, PROVIDER, toPaper, toPapers } from './mapper';
import { filterParams } from './query';
import type { S2Paper, S2Search } from './types';

/* Semantic Scholar as a paper source: relevance search, single papers, batches
   and "papers like this one" (its recommendations). Search results come in
   its relevance order only. Every Semantic Scholar detail stays in this folder. */

export const MAX_QUERY_CHARS = 1500;
/* Search can't reach past the first 1,000 results. */
export const MAX_OFFSET = 1000;
export const SIMILAR_MAX = 100;
const BATCH = 500;

export function s2Source(transport: ScholarlyTransport): PaperSource {
  const g = (path: string, params: Record<string, string | number | undefined> = {}) => transport.call<unknown>({ path, params: { fields: FIELDS, ...params } }).then((r) => r.body);

  const refId = (ref: PaperRef) => {
    if (ref.kind === 'id') return toS2Id(ref.id);
    if (ref.kind === 'doi') return `DOI:${ref.doi}`;
    if (ref.kind === 'pmid') return `PMID:${ref.id}`;
    return `PMCID:${ref.id.replace(/^pmc/i, '')}`;
  };

  return {
    name: PROVIDER,
    limits: { maxQueryChars: MAX_QUERY_CHARS, semanticMax: 0 },
    parseId: (raw) => toS2Id(raw),

    async search(q: KeywordQuery): Promise<PaperPage> {
      const filters = filterParams(q.filters);
      const query = searchWords(q.text, 12).join(' ');
      const offset = ((q.page ?? 1) - 1) * q.perPage;
      if (!filters || !query || offset >= MAX_OFFSET) return { papers: [], total: 0, costUsd: 0 };
      const body = (await g('/graph/v1/paper/search', { query, offset, limit: Math.min(q.perPage, MAX_OFFSET - offset), ...(filters as Record<string, string | number>) })) as S2Search;
      return { papers: toPapers(body.data), total: Math.min(MAX_OFFSET, Math.max(0, Number(body.total) || 0)), costUsd: 0 };
    },

    async getPaper(ref) {
      const id = refId(ref);
      if (!id) return { paper: null, costUsd: 0 };
      try {
        return { paper: toPaper((await g(`/graph/v1/paper/${encodeURIComponent(id)}`)) as S2Paper), costUsd: 0 };
      } catch (e) {
        if ((e as { code?: string })?.code === 'not_found') return { paper: null, costUsd: 0 };
        throw e;
      }
    },

    async getPapers(kind, values) {
      const found = new Map<string, Paper>();
      const asked = [...new Set(kind === 'doi' ? values.map((d) => d.toLowerCase()) : values)];
      const ids = asked.map((v) => (kind === 'doi' ? `DOI:${v}` : toS2Id(v)));
      for (let i = 0; i < asked.length; i += BATCH) {
        const chunk = asked.slice(i, i + BATCH);
        const chunkIds = ids.slice(i, i + BATCH);
        const usable = chunkIds.map((id, j) => ({ id, asked: chunk[j] })).filter((x): x is { id: string; asked: string } => !!x.id);
        if (!usable.length) continue;
        const { body } = await transport.call<(S2Paper | null)[]>({ path: '/graph/v1/paper/batch', params: { fields: FIELDS }, body: { ids: usable.map((x) => x.id) } });
        (Array.isArray(body) ? body : []).forEach((raw, j) => {
          const p = toPaper(raw);
          if (p && usable[j]) found.set(usable[j].asked, p);
        });
      }
      return { found, costUsd: 0 };
    },

    /* Its recommendations for a paper; filters are left to the app. */
    async similar(id, q) {
      const s2 = toS2Id(id);
      if (!s2) return { papers: [], costUsd: 0 };
      const body = (await g(`/recommendations/v1/papers/forpaper/${encodeURIComponent(s2)}`, { limit: Math.min(q.limit, SIMILAR_MAX) })) as { recommendedPapers?: S2Paper[] };
      return { papers: toPapers(body.recommendedPapers), costUsd: 0 };
    },
  };
}
