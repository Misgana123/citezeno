import type { PaperSources } from '@/lib/providers/papers/sources';
import type { ListQuery, PaperPage, PaperSource } from '@/lib/providers/papers/types';
import { PapersError } from '../errors';
import { PER_PAGE, pageResult } from '../search/page';
import { capText, DEFAULT_QUERY_CHARS } from '../search/query-length';
import type { SearchRequest } from '../search/request';
import { listFromPool, poolCapped, semanticPool, type Pool } from '../search/semantic';
import type { PaperListResult } from '../search/types';
import type { Paper } from '../types';
import { getPaper } from './paper';

/* The three related-paper lists. Each takes the same filters, sort and page as
   the main search (the request's query is ignored). */

const listQuery = (req: SearchRequest): ListQuery => ({ filters: req.filters, sort: req.sort, page: req.page, perPage: PER_PAGE });

async function relatedList(fetch: ((id: string, q: ListQuery) => Promise<PaperPage>) | undefined, id: string, req: SearchRequest): Promise<PaperListResult> {
  if (!fetch) throw new PapersError('bad_request', 'This list isn’t available right now.');
  return pageResult(await fetch(id, listQuery(req)), req, { mode: 'keyword', searches: 0, perPage: PER_PAGE, searched: false });
}

/* Papers this paper cites; the provider filters, sorts and pages them. */
export const referencesOf = (papers: PaperSource, id: string, req: SearchRequest) => relatedList(papers.references?.bind(papers), id, req);

/* Later papers that list this paper in their references. */
export const citedBy = (papers: PaperSource, id: string, req: SearchRequest) => relatedList(papers.citedBy?.bind(papers), id, req);

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

/* Papers close in meaning to this one: the primary source's own "similar"
   when it has one, else its title and abstract through search by meaning. */
export async function similarTo(sources: PaperSources, id: string, req: SearchRequest, maxChars = DEFAULT_QUERY_CHARS): Promise<PaperListResult> {
  const { primary } = sources;
  const { paper, costUsd: lookup } = await getPaper(primary, id);
  const meaning = sources.withCapability('semantic_search');
  let pool: Pool;
  let capped: boolean;
  if (primary.similar) {
    pool = await primary.similar(id, { filters: req.filters, limit: primary.limits.semanticMax });
    capped = pool.papers.length >= primary.limits.semanticMax;
  } else if (meaning) {
    pool = await semanticPool(meaning, similarText(paper, maxChars), req.filters);
    capped = poolCapped(meaning, pool);
  } else {
    throw new PapersError('bad_request', 'Finding similar papers isn’t available right now.');
  }
  const others = pool.papers.filter((p) => !isSameWork(p, paper));
  const list = listFromPool(others, { ...req, truncated: false }, { mode: 'semantic', capped });
  return { list, costUsd: lookup + pool.costUsd, searches: 1 };
}
