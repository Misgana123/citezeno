import { describe, expect, it, vi } from 'vitest';
import { PapersError } from '@/lib/papers/errors';
import type { OpenAlexClient } from '@/lib/papers/openalex/client';
import { citedBy, isSameWork, referencesOf, similarText, similarTo } from '@/lib/papers/related/lists';
import { getPaper, parsePaperId } from '@/lib/papers/related/paper';
import { parseSearchRequest } from '@/lib/papers/search/request';

const req = (qs = '') => parseSearchRequest(new URLSearchParams(qs), { requireQuery: false });

function client(handler: (path: string, params: Record<string, unknown>) => unknown) {
  const get = vi.fn(async (path: string, params: Record<string, unknown>) => ({ body: handler(path, params), costUsd: 0.0001, status: 200 }));
  return { client: { get } as unknown as OpenAlexClient, get };
}

describe('parsePaperId', () => {
  it('accepts work IDs and OpenAlex URLs', () => {
    expect(parsePaperId('W123')).toBe('W123');
    expect(parsePaperId('w123')).toBe('W123');
    expect(parsePaperId(encodeURIComponent('https://openalex.org/W5'))).toBe('W5');
  });

  it('rejects anything else', () => {
    for (const bad of ['', 'A1', 'W', 'W1;drop', '../W1']) expect(() => parsePaperId(bad)).toThrow(PapersError);
  });
});

describe('getPaper', () => {
  it('fetches the detail fields', async () => {
    const { client: c, get } = client(() => ({ id: 'https://openalex.org/W7', display_name: 'T', referenced_works: ['https://openalex.org/W1'] }));
    const { paper } = await getPaper(c, 'W7');
    expect(get.mock.calls[0][0]).toBe('/works/W7');
    expect(String(get.mock.calls[0][1].select)).toContain('referenced_works');
    expect(paper).toMatchObject({ id: 'W7', title: 'T', referencedWorkIds: ['W1'] });
  });

  it('fails as not found for an unusable record', async () => {
    await expect(getPaper(client(() => ({})).client, 'W7')).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('references and cited-by', () => {
  it('filter by cited_by / cites with the user filters, sort and page', async () => {
    const { client: c, get } = client(() => ({ meta: { count: 30 }, results: [{ id: 'W2' }] }));
    const refs = await referencesOf(c, 'W7', req('sort=newest&page=2&oa=1'));
    expect(get.mock.calls[0][1]).toMatchObject({ filter: 'cited_by:W7,is_oa:true,is_retracted:false', sort: 'publication_date:desc', page: 2, per_page: 25 });
    expect(get.mock.calls[0][1].search).toBeUndefined();
    expect(refs).toMatchObject({ searches: 0, list: { total: 30, hasMore: false } });

    await citedBy(c, 'W7', req('minCites=3'));
    expect(get.mock.calls[1][1].filter).toBe('cites:W7,is_retracted:false,cited_by_count:>2');
  });
});

describe('similarTo', () => {
  it('searches by title and abstract and leaves out the paper itself', async () => {
    const { client: c, get } = client((path) =>
      path === '/works/W7'
        ? { id: 'W7', display_name: 'Sleep and memory', doi: '10.1000/s', abstract_inverted_index: { Teens: [0], sleep: [1] } }
        : { results: [{ id: 'W7' }, { id: 'W8', doi: '10.1000/S' }, { id: 'W9' }] },
    );
    const res = await similarTo(c, 'W7', req());
    expect(get.mock.calls[1][1]['search.semantic']).toBe('Sleep and memory\n\nTeens sleep');
    expect(res.list.papers.map((p) => p.id)).toEqual(['W9']);
    expect(res).toMatchObject({ searches: 1, costUsd: 0.0002, list: { mode: 'semantic' } });
  });

  it('leaves out other copies of the same paper', async () => {
    const title = 'The state of OA: a large-scale analysis';
    const { client: c } = client((path) =>
      path === '/works/W7'
        ? { id: 'W7', display_name: title }
        : { results: [{ id: 'W8', display_name: 'The State of OA — A Large-Scale Analysis' }, { id: 'W9', display_name: 'Short' }, { id: 'W10', display_name: 'Other' }] },
    );
    const res = await similarTo(c, 'W7', req());
    expect(res.list.papers.map((p) => p.id)).toEqual(['W9', 'W10']);
  });

  it('only matches long titles, so short generic ones are kept', () => {
    const p = (id: string, title: string) => ({ openalexId: id, doi: null, title }) as never;
    expect(isSameWork(p('W1', 'Editorial'), p('W2', 'Editorial'))).toBe(false);
    expect(isSameWork(p('W1', 'A long and specific paper title'), p('W2', 'A long and specific paper title.'))).toBe(true);
  });

  it('uses only the title when there is no abstract', () => {
    expect(similarText({ title: 'T', abstract: null } as never)).toBe('T');
  });

  it('keeps long abstracts within the search length limit', () => {
    const text = similarText({ title: 'Title', abstract: 'word '.repeat(600) } as never);
    expect(text.length).toBeLessThanOrEqual(1500);
    expect(similarText({ title: 'Title', abstract: 'word '.repeat(600) } as never, 300).length).toBeLessThanOrEqual(300);
  });
});
