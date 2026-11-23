import { describe, expect, it, vi } from 'vitest';
import { keywordAcross } from '@/lib/papers/search/across';
import { matchesFilters } from '@/lib/papers/search/postprocess';
import { parseSearchRequest } from '@/lib/papers/search/request';
import { runSearch } from '@/lib/papers/search/run';
import { smartSearch } from '@/lib/papers/search/smart';
import type { Paper } from '@/lib/papers/types';
import { ProviderError } from '@/lib/providers/errors';
import { memoryPaperCopy } from '@/lib/papers/local/memory';
import { localSearch } from '@/lib/papers/local/source';
import { paperSources } from '@/lib/providers/papers/sources';
import type { PaperSource } from '@/lib/providers/papers/types';
import { paper } from '../shelf/fixtures';

/* Searching several paper sources at once, and showing what worked when one fails. */

const parse = (qs: string) => parseSearchRequest(new URLSearchParams(qs));
const down = () => new ProviderError('unavailable', 'down', { reason: 'timeout' });

/* A source answering keyword searches with `papers` (or failing), and meaning searches with `semantic`. */
function source(name: string, papers: Paper[] | Error, opts: { total?: number; semantic?: Paper[] | Error } = {}): PaperSource & { search: ReturnType<typeof vi.fn> } {
  const answer = async (v: Paper[] | Error) => {
    if (v instanceof Error) throw v;
    return v;
  };
  return {
    name,
    limits: { maxQueryChars: 1500, semanticMax: 50 },
    parseId: () => null,
    search: vi.fn(async () => ({ papers: await answer(papers), total: opts.total ?? (papers instanceof Error ? 0 : papers.length), costUsd: name === 'openalex' ? 0.001 : 0 })),
    getPaper: async () => ({ paper: null, costUsd: 0 }),
    ...(opts.semantic ? { semanticSearch: async () => ({ papers: await answer(opts.semantic as Paper[] | Error), costUsd: 0.001 }) } : {}),
  } as never;
}

const ax = (id: string, over: Partial<Paper> = {}) => paper(id, { id: `arxiv:${id}`, provider: 'arxiv', ...over });

describe('filters on other sources’ results', () => {
  it('drops papers that clearly fail a filter, keeps unknowns', () => {
    const f = parse('q=x&from=2020&oa=1&lang=en&type=article&abstract=1&minCites=3').filters;
    expect(matchesFilters(paper('W1', { year: 2021, citedByCount: 5 }), f)).toBe(true);
    expect(matchesFilters(paper('W1', { year: 2019, citedByCount: 5 }), f)).toBe(false);
    expect(matchesFilters(paper('W1', { year: null, language: null, type: null, citedByCount: 5 }), f)).toBe(true);
    expect(matchesFilters(paper('W1', { language: 'de', citedByCount: 5 }), f)).toBe(false);
    expect(matchesFilters(paper('W1', { citedByCount: 1 }), f)).toBe(false);
    expect(matchesFilters(paper('W1', { isRetracted: true, citedByCount: 5 }), parse('q=x').filters)).toBe(false);
  });
});

describe('keyword search across sources', () => {
  it('with one source, it is the plain keyword search', async () => {
    const oa = source('openalex', [paper('W1'), paper('W2')], { total: 80 });
    const r = await keywordAcross(paperSources([oa]), parse('q=genes&mode=keyword&page=2'));
    expect(oa.search).toHaveBeenCalledWith(expect.objectContaining({ page: 2, perPage: 25 }));
    expect(r.list).toMatchObject({ total: 80, perPage: 25, hasMore: true, notices: [] });
  });

  it('merges every source’s page, folding duplicates by DOI and filtering the others', async () => {
    const oa = source('openalex', [paper('W1'), paper('W2')], { total: 100 });
    const arxiv = source('arxiv', [ax('A1', { doi: '10.1000/w2' }), ax('A2', { language: 'de' }), ax('A3')], { total: 12 });
    const r = await keywordAcross(paperSources([oa, arxiv]), parse('q=genes&mode=keyword&lang=en'));
    expect(arxiv.search).toHaveBeenCalledWith(expect.objectContaining({ page: 1, perPage: 10 }));
    expect(r.list.papers.map((p) => p.id).sort()).toEqual(['arxiv:A3', 'openalex:W1', 'openalex:W2']); // A1 = W2, A2 is German
    expect(r.list).toMatchObject({ total: 112, hasMore: true, notices: [] });
    expect(r.costUsd).toBe(0.001);
  });

  it('a failing source is left out with a note; the search fails only when all do', async () => {
    const r = await keywordAcross(paperSources([source('openalex', [paper('W1')]), source('arxiv', down())]), parse('q=genes&mode=keyword'));
    expect(r.list.papers.map((p) => p.id)).toEqual(['openalex:W1']);
    expect(r.list.notices).toEqual(['partial_results']);

    const r2 = await keywordAcross(paperSources([source('openalex', down()), source('arxiv', [ax('A1')])]), parse('q=genes&mode=keyword'));
    expect(r2.list.papers.map((p) => p.id)).toEqual(['arxiv:A1']);
    expect(r2.list.notices).toEqual(['partial_results']);

    const primaryError = new ProviderError('busy', 'openalex busy', { reason: 'rate_queue' });
    await expect(keywordAcross(paperSources([source('openalex', primaryError), source('arxiv', down())]), parse('q=genes&mode=keyword'))).rejects.toBe(primaryError);
  });

  it('a slow source is left out after its deadline; the primary is always waited for', async () => {
    const slow = source('europepmc', [ax('E1')]);
    slow.search.mockImplementation(() => new Promise((ok) => setTimeout(() => ok({ papers: [ax('E1')], total: 1, costUsd: 0 }), 200)));
    const oa = source('openalex', [paper('W1')]);
    oa.search.mockImplementation(() => new Promise((ok) => setTimeout(() => ok({ papers: [paper('W1')], total: 1, costUsd: 0 }), 100)));
    const t = Date.now();
    const r = await keywordAcross(paperSources([oa, slow]), parse('q=genes&mode=keyword'), 50);
    expect(Date.now() - t).toBeLessThan(180);
    expect(r.list.papers.map((p) => p.id)).toEqual(['openalex:W1']);
    expect(r.list.notices).toEqual(['partial_results']);
  });

  it('sorts the merged page when asked', async () => {
    const r = await keywordAcross(paperSources([source('openalex', [paper('W1', { citedByCount: 3 })]), source('arxiv', [ax('A1', { citedByCount: 9 })])]), parse('q=genes&mode=keyword&sort=cited'));
    expect(r.list.papers.map((p) => p.id)).toEqual(['arxiv:A1', 'openalex:W1']);
  });
});

describe('Smart mode when part of it fails', () => {
  it('a failed meaning search still shows the keyword results, with a note and one search spent', async () => {
    const oa = source('openalex', [paper('W1'), paper('W2')], { semantic: down() });
    const r = await smartSearch(paperSources([oa]), parse('q=genes'));
    expect(r.list.papers.map((p) => p.id)).toEqual(['openalex:W1', 'openalex:W2']);
    expect(r.list.notices).toContain('partial_results');
    expect(r.searches).toBe(1);
  });

  it('a failed keyword search still shows the meaning results', async () => {
    const r = await smartSearch(paperSources([source('openalex', down(), { semantic: [paper('W5')] })]), parse('q=genes'));
    expect(r.list.papers.map((p) => p.id)).toEqual(['openalex:W5']);
    expect(r.list.notices).toContain('partial_results');
  });

  it('other sources join the pool; all failing fails the search', async () => {
    const r = await smartSearch(paperSources([source('openalex', [paper('W1')], { semantic: [paper('W1')] }), source('pubmed', [paper('P1', { id: 'pubmed:P1', provider: 'pubmed' })])]), parse('q=genes'));
    expect(r.list.papers.map((p) => p.id)).toEqual(['openalex:W1', 'pubmed:P1']);
    expect(r.list.notices).not.toContain('partial_results');
    expect(r.searches).toBe(2);
    await expect(smartSearch(paperSources([source('openalex', down(), { semantic: down() })]), parse('q=genes'))).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('runSearch sends keyword mode across sources', async () => {
    const arxiv = source('arxiv', [ax('A1')]);
    await runSearch(paperSources([source('openalex', [paper('W1')]), arxiv]), parse('q=genes&mode=keyword'));
    expect(arxiv.search).toHaveBeenCalled();
  });
});

describe('searching our own copy first', () => {
  async function copyWith(n: number) {
    const store = memoryPaperCopy();
    await store.save(Array.from({ length: n }, (_, i) => paper(`C${i}`, { title: `Gene editing study ${i}`, citedByCount: i })), { detail: false, origin: 'live' });
    return store;
  }

  it('a copy with enough matches answers keyword search alone, free', async () => {
    const oa = source('openalex', [paper('W1')]);
    const arxiv = source('arxiv', [ax('A1')]);
    const r = await keywordAcross(paperSources([oa, arxiv], localSearch(await copyWith(60), 50)), parse('q=gene editing&mode=keyword&page=2&sort=cited'));
    expect(oa.search).not.toHaveBeenCalled();
    expect(arxiv.search).not.toHaveBeenCalled();
    expect(r.list).toMatchObject({ total: 60, page: 2, hasMore: true, mode: 'keyword' });
    expect(r.list.papers[0].id).toBe('openalex:C34'); // cited order, second page
    expect(r.searches).toBe(0);
  });

  it('too few matches, or a failing copy: the sources answer as before', async () => {
    const oa = source('openalex', [paper('W1')]);
    await keywordAcross(paperSources([oa], localSearch(await copyWith(10), 50)), parse('q=gene editing&mode=keyword'));
    expect(oa.search).toHaveBeenCalledTimes(1);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = { minResults: 1, search: async () => Promise.reject(new Error('db down')) };
    const r = await keywordAcross(paperSources([oa], broken), parse('q=gene editing&mode=keyword'));
    expect(r.list.papers.map((p) => p.id)).toEqual(['openalex:W1']);
    warn.mockRestore();
  });

  it('in Smart mode the copy gives the keyword half; the meaning search stays live', async () => {
    const oa = source('openalex', [paper('W1')], { semantic: [paper('S1')] });
    const pubmed = source('pubmed', [paper('P1', { id: 'pubmed:P1', provider: 'pubmed' })]);
    const r = await smartSearch(paperSources([oa, pubmed], localSearch(await copyWith(60), 50)), parse('q=gene editing'));
    expect(oa.search).not.toHaveBeenCalled();
    expect(pubmed.search).not.toHaveBeenCalled();
    expect(r.list.papers.map((p) => p.id)).toContain('openalex:S1');
    expect(r.list.papers.some((p) => p.id.startsWith('openalex:C'))).toBe(true);
    expect(r.searches).toBe(1); // only the meaning search
  });
});
