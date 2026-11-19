import { describe, expect, it, vi } from 'vitest';
import { PapersError } from '@/lib/papers/errors';
import { userMessage } from '@/lib/papers/messages';
import { buildFilter, sortParam, unsupportedBySemantic } from '@/lib/providers/openalex/filters';
import { keywordSearch } from '@/lib/papers/search/keyword';
import { capText, DEFAULT_QUERY_CHARS } from '@/lib/papers/search/query-length';
import { DEFAULT_FILTERS, parseSearchRequest } from '@/lib/papers/search/request';
import { openAlexOver } from './fake-openalex';

const parse = (qs: string, opts?: { requireQuery?: boolean }) => parseSearchRequest(new URLSearchParams(qs), opts);

function badRequest(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(PapersError);
    return (e as PapersError).message;
  }
  throw new Error('expected a bad request');
}

describe('parseSearchRequest', () => {
  it('applies defaults', () => {
    expect(parse('q=  gene   therapy ')).toEqual({
      query: 'gene therapy',
      truncated: false,
      mode: 'smart',
      sort: 'relevance',
      page: 1,
      filters: DEFAULT_FILTERS,
    });
  });

  it('reads every filter', () => {
    const r = parse('q=x&mode=keyword&sort=cited&page=3&from=2010&to=2020&oa=1&type=article,preprint&type=article&lang=EN&abstract=true&retracted=1&minCites=50');
    expect(r).toMatchObject({ mode: 'keyword', sort: 'cited', page: 3 });
    expect(r.filters).toEqual({
      yearFrom: 2010,
      yearTo: 2020,
      openAccess: true,
      types: ['article', 'preprint'],
      language: 'en',
      hasAbstract: true,
      hideRetracted: false,
      minCitations: 50,
    });
  });

  it('caps long text at the search length limit and flags it', () => {
    const r = parse(`q=${'a'.repeat(DEFAULT_QUERY_CHARS + 10)}`);
    expect(r.query).toHaveLength(DEFAULT_QUERY_CHARS);
    expect(r.truncated).toBe(true);
    const paid = parseSearchRequest(new URLSearchParams(`q=${'a'.repeat(1800)}`), { maxQueryChars: 2000 });
    expect([paid.query.length, paid.truncated]).toEqual([1800, false]);
  });

  it('cuts at a word break when one is near the end', () => {
    expect(capText('alpha beta gamma', 12)).toBe('alpha beta');
    expect(capText('one two three', 9)).toBe('one two t'); // no break near the end: hard cut
    expect(capText('abcdefghij', 5)).toBe('abcde');
    expect(capText('short', 10)).toBe('short');
  });

  it('rejects bad input with readable messages', () => {
    expect(badRequest(() => parse(''))).toMatch(/Type a topic/);
    expect(badRequest(() => parse('q=x&mode=magic'))).toBeTruthy();
    expect(badRequest(() => parse('q=x&page=0'))).toBeTruthy();
    expect(badRequest(() => parse('q=x&page=101'))).toBeTruthy();
    expect(badRequest(() => parse('q=x&type=poem'))).toBeTruthy();
    expect(badRequest(() => parse('q=x&lang=english'))).toBe('Unknown language.');
    expect(badRequest(() => parse('q=x&from=2020&to=2010'))).toMatch(/after/);
    expect(badRequest(() => parse('q=x&from=3000'))).toMatch(/from/);
    expect(badRequest(() => parse('q=x&minCites=-1'))).toBeTruthy();
    expect(badRequest(() => parse(`q=${'a'.repeat(10_001)}`))).toMatch(/too long/);
  });

  it('allows an empty query for related lists', () => {
    expect(parse('sort=newest', { requireQuery: false }).query).toBe('');
  });

  it('treats minCites=0 as no filter', () => {
    expect(parse('q=x&minCites=0').filters.minCitations).toBeNull();
  });
});

describe('buildFilter', () => {
  const f = (over: Partial<typeof DEFAULT_FILTERS>) => ({ ...DEFAULT_FILTERS, ...over });

  it('hides retracted papers by default', () => {
    expect(buildFilter(DEFAULT_FILTERS, 'keyword')).toBe('is_retracted:false');
    expect(buildFilter(f({ hideRetracted: false }), 'keyword')).toBe('');
  });

  it('builds year ranges', () => {
    expect(buildFilter(f({ yearFrom: 2010, yearTo: 2020, hideRetracted: false }), 'keyword')).toBe('publication_year:2010-2020');
    expect(buildFilter(f({ yearFrom: 2010, yearTo: 2010, hideRetracted: false }), 'keyword')).toBe('publication_year:2010');
    expect(buildFilter(f({ yearFrom: 2010, hideRetracted: false }), 'keyword')).toBe('publication_year:>2009');
    expect(buildFilter(f({ yearTo: 2020, hideRetracted: false }), 'keyword')).toBe('publication_year:<2021');
  });

  it('joins every filter', () => {
    const all = f({ openAccess: true, types: ['article', 'preprint'], language: 'en', hasAbstract: true, minCitations: 10 });
    expect(buildFilter(all, 'keyword')).toBe('is_oa:true,type:article|preprint,language:en,has_abstract:true,is_retracted:false,cited_by_count:>9');
  });

  it('leaves citation counts out of semantic filters', () => {
    const all = f({ minCitations: 10 });
    expect(buildFilter(all, 'semantic')).toBe('is_retracted:false');
    expect(unsupportedBySemantic(all)).toEqual(['minCitations']);
    expect(unsupportedBySemantic(DEFAULT_FILTERS)).toEqual([]);
  });

  it('puts extra clauses first', () => {
    expect(buildFilter(DEFAULT_FILTERS, 'keyword', ['cites:W1'])).toBe('cites:W1,is_retracted:false');
  });

  it('maps sorts', () => {
    expect(sortParam('relevance')).toBeUndefined();
    expect(sortParam('newest')).toBe('publication_date:desc');
    expect(sortParam('cited')).toBe('cited_by_count:desc');
  });
});

describe('keywordSearch', () => {
  it('sends the right params and maps the page', async () => {
    const get = vi.fn(async () => ({
      body: { meta: { count: 60 }, results: [{ id: 'https://openalex.org/W1', display_name: 'A' }, { id: null }] },
      costUsd: 0.001,
      status: 200,
    }));
    const client = openAlexOver(get as never);
    const res = await keywordSearch(client, { ...parse('q=crispr&mode=keyword&sort=newest&page=2&minCites=5'), truncated: true });

    const [path, params] = get.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(path).toBe('/works');
    expect(params).toMatchObject({ search: 'crispr', filter: 'is_retracted:false,cited_by_count:>4', sort: 'publication_date:desc', page: 2, per_page: 25 });
    expect(String(params.select)).toContain('abstract_inverted_index');

    expect(res.costUsd).toBe(0.001);
    expect(res.searches).toBe(1);
    expect(res.list).toMatchObject({ total: 60, page: 2, perPage: 25, hasMore: true, mode: 'keyword', sort: 'newest', notices: ['query_truncated'] });
    expect(res.list.papers.map((p) => p.id)).toEqual(['openalex:W1']);
  });

  it('reports the last page', async () => {
    const client = openAlexOver(async () => ({ body: { meta: { count: 30 }, results: [] }, costUsd: 0, status: 200 }));
    const res = await keywordSearch(client, parse('q=x&page=2'));
    expect(res.list.hasMore).toBe(false);
  });
});

describe('userMessage', () => {
  it('keeps input messages and replaces the rest', () => {
    expect(userMessage(new PapersError('bad_request', 'Check the "to" year.'))).toBe('Check the "to" year.');
    expect(userMessage(new PapersError('unavailable', 'OpenAlex answered 503.'))).toMatch(/temporarily unavailable/);
    expect(userMessage(new PapersError('busy', 'x'))).toBe('Search is busy, please try again in a moment.');
  });
});
