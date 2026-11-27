import type { PaperSources } from '@/lib/providers/papers/sources';
import type { PaperSource } from '@/lib/providers/papers/types';
import type { Paper } from '../types';
import { extraSources, extraWaitMs, filtered, firstError, fromCopy, settleAll } from './across';
import { fuseRanked } from './fuse';
import type { SearchFilters, SearchRequest } from './request';
import { listFromPool, poolCapped, semanticPool, type Pool } from './semantic';
import type { PaperListResult } from './types';

/* Smart mode: keyword and semantic search side by side, merged with Reciprocal
   Rank Fusion on our server. Costs two searches. Keyword results come from the
   primary source; the meaning search from the first source that offers it;
   every other enabled source adds its own top keyword matches. With no meaning
   search, Smart mode is a keyword search over the same pool. When one part
   fails, the others' results are shown with a note; only when all fail does
   the search fail. With the copy searched first and enough matches in it, the
   copy gives the keyword half (for every source); the meaning half stays live. */

export const SMART_KEYWORD_POOL = 50;
/* Top matches each additional source adds to the pool. */
export const SMART_EXTRA_POOL = 25;

/* The top keyword results by relevance, with every filter. */
export async function keywordPool(papers: PaperSource, query: string, filters: SearchFilters, perPage = SMART_KEYWORD_POOL): Promise<Pool & { total: number }> {
  return papers.search({ text: query, filters, perPage });
}

type Part = { kind: 'keyword' | 'semantic' | 'extra'; papers: Paper[]; costUsd: number; total?: number };

export async function smartSearch(sources: PaperSources, req: SearchRequest, deadlineMs = extraWaitMs()): Promise<PaperListResult> {
  const meaning = sources.withCapability('semantic_search');
  const local = await fromCopy(sources, { text: req.query, filters: req.filters, perPage: SMART_KEYWORD_POOL });
  const results = await settleAll<Part>([
    local
      ? { name: 'copy', run: async (): Promise<Part> => ({ kind: 'keyword', papers: local.papers, total: local.total, costUsd: 0 }) }
      : { name: 'keyword', run: async (): Promise<Part> => ({ kind: 'keyword', ...(await keywordPool(sources.primary, req.query, req.filters)) }) },
    ...(meaning ? [{ name: 'semantic', run: async (): Promise<Part> => ({ kind: 'semantic', ...(await semanticPool(meaning, req.query, req.filters)) }) }] : []),
    ...(local ? [] : extraSources(sources)).map((s) => ({ name: s.name, deadlineMs, run: async (): Promise<Part> => ({ kind: 'extra', ...(await keywordPool(s, req.query, req.filters, SMART_EXTRA_POOL)) }) })),
  ]);
  const ok = results.filter((r) => r.ok).map((r) => (r as { value: Part }).value);
  if (!ok.length) throw firstError(results);

  const keyword = ok.find((p) => p.kind === 'keyword');
  const semantic = ok.find((p) => p.kind === 'semantic');
  const lists = ok.map((p) => (p.kind === 'extra' ? filtered(p.papers, req) : p.papers));
  const merged = lists.length > 1 ? fuseRanked(lists) : lists[0];
  const capped = (!!keyword && (keyword.total ?? 0) > keyword.papers.length) || (!!semantic && !!meaning && poolCapped(meaning, semantic));
  const list = listFromPool(merged, req, { mode: 'smart', capped });
  if (ok.length < results.length) list.notices.push('partial_results');
  return {
    list,
    costUsd: ok.reduce((n, p) => n + p.costUsd, 0),
    searches: (keyword && !local ? 1 : 0) + (semantic ? 1 : 0),
  };
}
