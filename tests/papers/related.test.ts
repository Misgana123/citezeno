import { describe, expect, it, vi } from 'vitest';
import { PapersError } from '@/lib/papers/errors';
import { citedBy, isSameWork, referencesOf, similarText, similarTo } from '@/lib/papers/related/lists';
import { getPaper, parsePaperId } from '@/lib/papers/related/paper';
import { parseSearchRequest } from '@/lib/papers/search/request';
import { openAlexOver, sourcesOver } from './fake-openalex';

const req = (qs = '') => parseSearchRequest(new URLSearchParams(qs), { requireQuery: false });

function client(handler: (path: string, params: Record<string, unknown>) => unknown) {
  const get = vi.fn(async (path: string, params: Record<string, unknown>) => ({ body: handler(path, params), costUsd: 0.0001, status: 200 }));
  return { client: openAlexOver(get as never), sources: sourcesOver(get as never), get };
}

describe('parsePaperId', () => {
  const sources = sourcesOver(async () => ({ body: {}, costUsd: 0, status: 200 }));
  const parse = (raw: string) => {
    const t = parsePaperId(sources, raw);
    return `${t.source.name}/${t.id}`;
  };

  it('accepts Citezeno paper IDs, and IDs and links an enabled source recognises', () => {
    expect(parse('openalex:W123')).toBe('openalex/W123');
    expect(parse(encodeURIComponent('openalex:W123'))).toBe('openalex/W123');
    expect(parse('W123')).toBe('openalex/W123');
    expect(parse('w123')).toBe('openalex/W123');
    expect(parse(encodeURIComponent('https://openalex.org/W5'))).toBe('openalex/W5');
  });

  it('rejects anything else, and IDs of providers that are not enabled', () => {
    for (const bad of ['', 'A1', 'W', 'W1;drop', '../W1', 'openalex:A1', 'semanticscholar:abc']) expect(() => parsePaperId(sources, bad)).toThrow(PapersError);
  });
});

describe('getPaper', () => {
  it('fetches the detail fields', async () => {
    const { client: c, get } = client(() => ({ id: 'https://openalex.org/W7', display_name: 'T', referenced_works: ['https://openalex.org/W1'] }));
    const { paper } = await getPaper({ source: c, id: 'W7' });
    expect(get.mock.calls[0][0]).toBe('/works/W7');
    expect(String(get.mock.calls[0][1].select)).toContain('referenced_works');
    expect(paper).toMatchObject({ id: 'openalex:W7', provider: 'openalex', record: { label: 'OpenAlex', url: 'https://openalex.org/W7' }, title: 'T', referenceIds: ['openalex:W1'] });
  });

  it('fails as not found for an unusable record', async () => {
    await expect(getPaper({ source: client(() => ({})).client, id: 'W7' })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('references and cited-by', () => {
  it('filter by cited_by / cites with the user filters, sort and page', async () => {
    const { client: c, get } = client(() => ({ meta: { count: 30 }, results: [{ id: 'W2' }] }));
    const refs = await referencesOf({ source: c, id: 'W7' }, req('sort=newest&page=2&oa=1'));
    expect(get.mock.calls[0][1]).toMatchObject({ filter: 'cited_by:W7,is_oa:true,is_retracted:false', sort: 'publication_date:desc', page: 2, per_page: 25 });
    expect(get.mock.calls[0][1].search).toBeUndefined();
    expect(refs).toMatchObject({ searches: 0, list: { total: 30, hasMore: false } });

    await citedBy({ source: c, id: 'W7' }, req('minCites=3'));
    expect(get.mock.calls[1][1].filter).toBe('cites:W7,is_retracted:false,cited_by_count:>2');
  });
});

describe('similarTo', () => {
  it('searches by title and abstract and leaves out the paper itself', async () => {
    const { sources: c, get } = client((path) =>
      path === '/works/W7'
        ? { id: 'W7', display_name: 'Sleep and memory', doi: '10.1000/s', abstract_inverted_index: { Teens: [0], sleep: [1] } }
        : { results: [{ id: 'W7' }, { id: 'W8', doi: '10.1000/S' }, { id: 'W9' }] },
    );
    const res = await similarTo(c, { source: c.primary, id: 'W7' }, req());
    expect(get.mock.calls[1][1]['search.semantic']).toBe('Sleep and memory\n\nTeens sleep');
    expect(res.list.papers.map((p) => p.id)).toEqual(['openalex:W9']);
    expect(res).toMatchObject({ searches: 1, costUsd: 0.0002, list: { mode: 'semantic' } });
  });

  it('leaves out other copies of the same paper', async () => {
    const title = 'The state of OA: a large-scale analysis';
    const { sources: c } = client((path) =>
      path === '/works/W7'
        ? { id: 'W7', display_name: title }
        : { results: [{ id: 'W8', display_name: 'The State of OA — A Large-Scale Analysis' }, { id: 'W9', display_name: 'Short' }, { id: 'W10', display_name: 'Other' }] },
    );
    const res = await similarTo(c, { source: c.primary, id: 'W7' }, req());
    expect(res.list.papers.map((p) => p.id)).toEqual(['openalex:W9', 'openalex:W10']);
  });

  it('only matches long titles, so short generic ones are kept', () => {
    const p = (id: string, title: string) => ({ id, doi: null, title }) as never;
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
