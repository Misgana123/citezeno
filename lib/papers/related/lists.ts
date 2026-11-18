import type { OpenAlexClient } from '../openalex/client';
import { worksPage } from '../search/page';
import { capText, DEFAULT_QUERY_CHARS } from '../search/query-length';
import type { SearchRequest } from '../search/request';
import { listFromPool, SEMANTIC_MAX, semanticPool } from '../search/semantic';
import type { PaperListResult } from '../search/types';
import type { Paper } from '../types';
import { getPaper } from './paper';

/* The three related-paper lists. Each takes the same filters, sort and page as
   the main search (the request's query is ignored). */

/* Papers this paper cites. `cited_by:{id}` is OpenAlex's filter over the
   paper's referenced_works, so filters, sorting and paging all run there. */
export function referencesOf(client: OpenAlexClient, id: string, req: SearchRequest): Promise<PaperListResult> {
  return worksPage(client, req, { extraFilters: [`cited_by:${id}`], mode: 'keyword', searches: 0 });
}

/* Later papers that list this paper in their references. */
export function citedBy(client: OpenAlexClient, id: string, req: SearchRequest): Promise<PaperListResult> {
  return worksPage(client, req, { extraFilters: [`cites:${id}`], mode: 'keyword', searches: 0 });
}

/* The text "More like this" sends to semantic search, within the search length limit. */
export const similarText = (p: Paper, maxChars = DEFAULT_QUERY_CHARS) => capText([p.title, p.abstract].filter(Boolean).join('\n\n'), maxChars);

const titleKey = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/* The same paper, or another copy of it (a preprint or repository version
   with its own ID and DOI but the same title). */
export function isSameWork(a: Paper, b: Paper) {
  if (a.openalexId === b.openalexId || (a.doi && a.doi === b.doi)) return true;
  const key = titleKey(a.title);
  return key.length > 20 && key === titleKey(b.title);
}

/* Papers close in meaning to this one: its title and abstract through semantic search. */
export async function similarTo(client: OpenAlexClient, id: string, req: SearchRequest, maxChars = DEFAULT_QUERY_CHARS): Promise<PaperListResult> {
  const { paper, costUsd: lookup } = await getPaper(client, id);
  const pool = await semanticPool(client, similarText(paper, maxChars), req.filters);
  const others = pool.papers.filter((p) => !isSameWork(p, paper));
  const list = listFromPool(others, { ...req, truncated: false }, { mode: 'semantic', capped: pool.papers.length >= SEMANTIC_MAX });
  return { list, costUsd: lookup + pool.costUsd, searches: 1 };
}
