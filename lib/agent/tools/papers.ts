import { z } from 'zod';
import { citedBy, referencesOf, similarTo } from '@/lib/papers/related/lists';
import { getPaper, parsePaperId } from '@/lib/papers/related/paper';
import { SEARCH_MODES, SORTS, WORK_TYPES } from '@/lib/papers/search/options';
import { parseSearchRequest, type SearchRequest } from '@/lib/papers/search/request';
import { runSearch, searchesFor } from '@/lib/papers/search/run';
import type { PaperList } from '@/lib/papers/search/types';
import type { AgentContext } from '../context';
import { paperBrief } from './format';
import { defineTool, tally } from './types';

/* Find Papers as tools: the same searches, limits and lists as /papers. */

const filters = {
  yearFrom: z.number().int().optional().describe('Earliest publication year.'),
  yearTo: z.number().int().optional().describe('Latest publication year.'),
  openAccessOnly: z.boolean().optional().describe('Only papers free to read.'),
  types: z.array(z.enum(WORK_TYPES)).optional().describe('Only these kinds of work.'),
  language: z.string().length(2).optional().describe('ISO 639-1 language code, e.g. "en".'),
  hasAbstract: z.boolean().optional(),
  includeRetracted: z.boolean().optional().describe('Retracted papers are hidden unless this is true.'),
  minCitations: z.number().int().min(0).optional(),
  sort: z.enum(SORTS).optional().describe('relevance (default), newest or cited.'),
  page: z.number().int().min(1).max(20).optional(),
};

type Filters = { [K in keyof typeof filters]?: z.infer<(typeof filters)[K]> };

/* The tool's input as the query string /api/papers reads, so it is validated the same way. */
function request(ctx: AgentContext, f: Filters & { query?: string; mode?: string }, requireQuery: boolean): SearchRequest {
  const qs = new URLSearchParams();
  const set = (k: string, v: unknown) => v != null && v !== '' && qs.set(k, String(v));
  set('q', f.query);
  set('mode', f.mode);
  set('sort', f.sort);
  set('page', f.page);
  set('from', f.yearFrom);
  set('to', f.yearTo);
  if (f.openAccessOnly) qs.set('oa', '1');
  for (const t of f.types ?? []) qs.append('type', t);
  set('lang', f.language);
  if (f.hasAbstract) qs.set('abstract', '1');
  if (f.includeRetracted) qs.set('retracted', '1');
  set('minCites', f.minCitations);
  return parseSearchRequest(qs, { requireQuery, maxQueryChars: ctx.papersConfig.maxQueryChars });
}

const listOut = (list: PaperList) => ({
  result: { total: list.total, page: list.page, hasMore: list.hasMore, notices: list.notices, papers: list.papers.map((p) => paperBrief(p)) },
  display: { papers: list.papers, summary: tally(list.total, 'paper') },
});

const PAPER_ID = z.string().min(1).max(240).describe('A paperId from an earlier result, e.g. "openalex:W2741809807".');

export const searchPapers = defineTool({
  name: 'search_papers',
  description:
    'Search research papers by topic, question or a pasted paragraph. "smart" (default) mixes keyword and meaning; "keyword" matches words; "semantic" matches meaning. Returns 25 papers a page. Each search counts toward the user’s daily search limit (smart counts as two).',
  input: z.object({ query: z.string().min(1).max(10_000), mode: z.enum(SEARCH_MODES).optional(), ...filters }),
  kind: 'read',
  label: (i) => `Searching papers for “${i.query.slice(0, 60)}”`,
  async run(ctx, input) {
    const req = request(ctx, input, true);
    await ctx.reserveSearches(searchesFor(req.mode));
    return listOut((await runSearch(ctx.sources(), req)).list);
  },
});

export const getPaperTool = defineTool({
  name: 'get_paper',
  description: 'Full details of one paper: authors, abstract, topics, links, citation count and whether it is retracted. Free.',
  input: z.object({ paperId: PAPER_ID }),
  kind: 'read',
  label: () => 'Opening a paper',
  async run(ctx, { paperId }) {
    const { paper } = await getPaper(parsePaperId(ctx.sources(), paperId));
    return { result: { ...paperBrief(paper, { fullAbstract: true }), topics: paper.topics, references: paper.referenceIds.length }, display: { papers: [paper], summary: 'Opened' } };
  },
});

export const getReferences = defineTool({
  name: 'get_references',
  description: 'The papers this paper cites (its reference list), with the same filters and sorting as search. Free.',
  input: z.object({ paperId: PAPER_ID, ...filters }),
  kind: 'read',
  label: () => 'Reading the reference list',
  run: async (ctx, { paperId, ...f }) => listOut((await referencesOf(parsePaperId(ctx.sources(), paperId), request(ctx, f, false))).list),
});

export const getCitingPapers = defineTool({
  name: 'get_citing_papers',
  description: 'Later papers that cite this paper, with the same filters and sorting as search. Free.',
  input: z.object({ paperId: PAPER_ID, ...filters }),
  kind: 'read',
  label: () => 'Finding papers that cite it',
  run: async (ctx, { paperId, ...f }) => listOut((await citedBy(parsePaperId(ctx.sources(), paperId), request(ctx, f, false))).list),
});

export const findSimilarPapers = defineTool({
  name: 'find_similar_papers',
  description: 'Papers close in meaning to this one ("more like this"). Counts as one search toward the daily limit.',
  input: z.object({ paperId: PAPER_ID, ...filters }),
  kind: 'read',
  label: () => 'Finding similar papers',
  async run(ctx, { paperId, ...f }) {
    const sources = ctx.sources();
    const target = parsePaperId(sources, paperId);
    await ctx.reserveSearches(1);
    return listOut((await similarTo(sources, target, request(ctx, f, false), ctx.papersConfig.maxQueryChars)).list);
  },
});

export const PAPER_TOOLS = [searchPapers, getPaperTool, getReferences, getCitingPapers, findSimilarPapers];
