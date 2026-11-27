import { describe, expect, it, vi } from 'vitest';
import type { OpenAlexWork } from '@/lib/providers/openalex/types';
import { fuseRanked } from '@/lib/papers/search/fuse';
import { applyServerFilters, paginate, sortPapers } from '@/lib/papers/search/postprocess';
import { parseSearchRequest } from '@/lib/papers/search/request';
import { runSearch, searchesFor } from '@/lib/papers/search/run';
import { semanticSearch } from '@/lib/papers/search/semantic';
import { smartSearch } from '@/lib/papers/search/smart';
import type { Paper } from '@/lib/papers/types';
import { sourcesOver } from './fake-openalex';

const paper = (id: string, over: Partial<Paper> = {}): Paper => ({
  id,
  provider: 'openalex',
  record: null,
  doi: null,
  title: id,
  authors: [],
  year: null,
  publicationDate: null,
  source: null,
  type: null,
  language: null,
  abstract: null,
  citedByCount: 0,
  isOpenAccess: false,
  pdfUrl: null,
  landingUrl: null,
  isRetracted: false,
  topics: [],
  referenceIds: [],
  ...over,
});

/* Work IDs, without the "openalex:" of Citezeno paper IDs. */
const ids = (papers: Paper[]) => papers.map((p) => p.id.replace(/^openalex:/, ''));
const parse = (qs: string) => parseSearchRequest(new URLSearchParams(qs));

/* A fake client: keyword calls get `keyword`, semantic calls get `semantic`. */
function fakeClient(keyword: OpenAlexWork[], semantic: OpenAlexWork[], keywordCount = keyword.length) {
  const get = vi.fn(async (_path: string, params: Record<string, unknown>) =>
    params['search.semantic'] != null
      ? { body: { meta: { count: semantic.length }, results: semantic }, costUsd: 0.001, status: 200 }
      : { body: { meta: { count: keywordCount }, results: keyword }, costUsd: 0.001, status: 200 },
  );
  return { client: sourcesOver(get as never), get };
}

describe('fuseRanked', () => {
  it('ranks papers found by both lists first', () => {
    const merged = fuseRanked([
      [paper('W1'), paper('W2'), paper('W3')],
      [paper('W4'), paper('W3'), paper('W5')],
    ]);
    expect(ids(merged)[0]).toBe('W3');
    expect(new Set(ids(merged)).size).toBe(5);
  });

  it('removes duplicates by ID, then by DOI, keeping the record with an abstract', () => {
    const merged = fuseRanked([
      [paper('W1', { doi: '10.1000/a' }), paper('W2')],
      [paper('W9', { doi: '10.1000/a', abstract: 'text' }), paper('W2')],
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.find((p) => p.doi === '10.1000/a')?.abstract).toBe('text');
  });

  it('keeps first-seen order on ties', () => {
    expect(ids(fuseRanked([[paper('W1')], [paper('W2')]]))).toEqual(['W1', 'W2']);
    expect(fuseRanked([])).toEqual([]);
  });
});

describe('server-side filtering, sorting and paging', () => {
  const list = [
    paper('W1', { citedByCount: 5, publicationDate: '2020-01-01', year: 2020 }),
    paper('W2', { citedByCount: 50, year: 2022 }),
    paper('W3', { citedByCount: 20 }),
    paper('W4', { citedByCount: 50, publicationDate: '2021-06-01', year: 2021 }),
  ];

  it('applies the minimum citation count', () => {
    expect(ids(applyServerFilters(list, { ...parse('q=x&minCites=20').filters }))).toEqual(['W2', 'W3', 'W4']);
    expect(applyServerFilters(list, parse('q=x').filters)).toBe(list);
  });

  it('sorts by newest and most cited, unknown dates last', () => {
    expect(ids(sortPapers(list, 'newest'))).toEqual(['W2', 'W4', 'W1', 'W3']);
    expect(ids(sortPapers(list, 'cited'))).toEqual(['W2', 'W4', 'W3', 'W1']);
    expect(sortPapers(list, 'relevance')).toBe(list);
  });

  it('pages', () => {
    expect(paginate([1, 2, 3, 4, 5], 1, 2)).toEqual({ items: [1, 2], hasMore: true });
    expect(paginate([1, 2, 3, 4, 5], 3, 2)).toEqual({ items: [5], hasMore: false });
    expect(paginate([1, 2], 5, 2)).toEqual({ items: [], hasMore: false });
  });
});

describe('semanticSearch', () => {
  it('asks for 50 results with only supported filters, then sorts and filters on the server', async () => {
    const { client, get } = fakeClient([], [
      { id: 'W1', cited_by_count: 3 },
      { id: 'W2', cited_by_count: 30 },
      { id: 'W3', cited_by_count: 300 },
    ]);
    const res = await semanticSearch(client.primary, parse('q=sleep and memory&mode=semantic&sort=cited&minCites=10&oa=1'));
    const [, params] = get.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(params).toMatchObject({ 'search.semantic': 'sleep and memory', filter: 'is_oa:true,is_retracted:false', per_page: 50 });
    expect(params.sort).toBeUndefined();
    expect(String(params.filter)).not.toContain('cited_by_count');
    expect(ids(res.list.papers)).toEqual(['W3', 'W2']);
    expect(res.list).toMatchObject({ total: 2, mode: 'semantic', hasMore: false, notices: ['filtered_top_results'] });
    expect(res.searches).toBe(1);
  });

  it('flags capped results', async () => {
    const works = Array.from({ length: 50 }, (_, i) => ({ id: `W${i + 1}` }));
    const res = await semanticSearch(fakeClient([], works).client.primary, parse('q=x&mode=semantic'));
    expect(res.list).toMatchObject({ total: 50, perPage: 25, hasMore: true, notices: ['results_capped'] });
  });
});

describe('smartSearch', () => {
  it('runs both searches, merges without duplicates and costs two searches', async () => {
    const { client, get } = fakeClient(
      [{ id: 'W1' }, { id: 'W2', doi: 'https://doi.org/10.1000/z' }],
      [{ id: 'W2' }, { id: 'W3' }, { id: 'W7', doi: '10.1000/Z' }],
    );
    const res = await smartSearch(client, parse('q=x'));
    expect(get).toHaveBeenCalledTimes(2);
    const calls = get.mock.calls.map((c) => c[1] as Record<string, unknown>);
    expect(calls.some((p) => p.search === 'x' && p.per_page === 50)).toBe(true);
    expect(calls.some((p) => p['search.semantic'] === 'x')).toBe(true);
    expect(ids(res.list.papers)[0]).toBe('W2');
    expect(ids(res.list.papers).sort()).toEqual(['W1', 'W2', 'W3']);
    expect(res).toMatchObject({ costUsd: 0.002, searches: 2 });
    expect(res.list.mode).toBe('smart');
  });

  it('notes when there are more keyword matches than the merged pool', async () => {
    const res = await smartSearch(fakeClient([{ id: 'W1' }], [], 900).client, parse('q=x'));
    expect(res.list.notices).toContain('results_capped');
  });

  it('applies the citation filter to semantic results and sorts the merged list', async () => {
    const res = await smartSearch(
      fakeClient([{ id: 'W1', cited_by_count: 40 }], [{ id: 'W2', cited_by_count: 1 }, { id: 'W3', cited_by_count: 90 }]).client,
      parse('q=x&minCites=10&sort=cited'),
    );
    expect(ids(res.list.papers)).toEqual(['W3', 'W1']);
    expect(res.list.notices).toContain('filtered_top_results');
  });
});

describe('runSearch', () => {
  it('dispatches by mode and counts searches', async () => {
    const { client, get } = fakeClient([{ id: 'W1' }], [{ id: 'W2' }]);
    expect((await runSearch(client, parse('q=x&mode=keyword'))).list.mode).toBe('keyword');
    expect((await runSearch(client, parse('q=x&mode=semantic'))).list.mode).toBe('semantic');
    expect((await runSearch(client, parse('q=x'))).list.mode).toBe('smart');
    expect(get).toHaveBeenCalledTimes(4);
    expect([searchesFor('smart'), searchesFor('keyword'), searchesFor('semantic')]).toEqual([2, 1, 1]);
  });
});
