import { describe, expect, it } from 'vitest';
import { listUrl } from '@/components/papers/api';
import { authorsShort, citationLabel, languageName, typeLabel } from '@/components/papers/format';
import { noticeText } from '@/components/papers/notices';
import { activeFilterCount, clearFilters, DEFAULT_STATE, stateFromParams, stateToParams, type SearchState } from '@/components/papers/state';
import { parseSearchRequest } from '@/lib/papers/search/request';

const FULL: SearchState = {
  q: 'sleep and memory',
  mode: 'semantic',
  sort: 'cited',
  from: '2010',
  to: '2020',
  oa: true,
  type: 'preprint',
  lang: 'en',
  abstract: true,
  retracted: true,
  minCites: '5',
};

describe('search state', () => {
  it('round-trips through the URL', () => {
    expect(stateFromParams(stateToParams(FULL))).toEqual(FULL);
    expect(stateFromParams(stateToParams(DEFAULT_STATE))).toEqual(DEFAULT_STATE);
  });

  it('keeps default values out of the URL', () => {
    expect(stateToParams({ ...DEFAULT_STATE, q: 'x' }).toString()).toBe('q=x');
    expect(stateToParams({ ...DEFAULT_STATE, q: 'x', minCites: '0' }).toString()).toBe('q=x');
  });

  it('builds queries the server accepts, with the same meaning', () => {
    const req = parseSearchRequest(stateToParams(FULL, { page: 2 }));
    expect(req).toMatchObject({ query: 'sleep and memory', mode: 'semantic', sort: 'cited', page: 2 });
    expect(req.filters).toEqual({
      yearFrom: 2010,
      yearTo: 2020,
      openAccess: true,
      types: ['preprint'],
      language: 'en',
      hasAbstract: true,
      hideRetracted: false,
      minCitations: 5,
    });
    expect(parseSearchRequest(stateToParams({ ...DEFAULT_STATE, q: 'x' })).filters.hideRetracted).toBe(true);
  });

  it('leaves the text out of related-list queries', () => {
    expect(stateToParams(FULL, { withQuery: false }).has('q')).toBe(false);
    expect(() => parseSearchRequest(stateToParams(FULL, { withQuery: false }), { requireQuery: false })).not.toThrow();
  });

  it('ignores malformed URL values', () => {
    expect(stateFromParams(new URLSearchParams('mode=evil&sort=x&from=20ab&lang=english&type=poem&minCites=-3'))).toEqual(DEFAULT_STATE);
  });

  it('counts and clears filters, keeping the text, mode and sort', () => {
    expect(activeFilterCount(DEFAULT_STATE)).toBe(0);
    expect(activeFilterCount(FULL)).toBe(7);
    expect(clearFilters(FULL)).toEqual({ ...DEFAULT_STATE, q: FULL.q, mode: FULL.mode, sort: FULL.sort });
  });
});

describe('list URLs', () => {
  it('points at our own API only', () => {
    expect(listUrl('search', new URLSearchParams('q=x'))).toBe('/api/papers/search?q=x');
    expect(listUrl('cited-by', new URLSearchParams(), 'W1')).toBe('/api/papers/W1/cited-by');
    expect(listUrl('similar', new URLSearchParams('sort=newest'), 'W1')).toBe('/api/papers/W1/similar?sort=newest');
  });
});

describe('display formatting', () => {
  it('shows the first three authors, then et al.', () => {
    const a = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `A${i + 1}`, orcid: null }));
    expect(authorsShort(a(2))).toBe('A1, A2');
    expect(authorsShort(a(3))).toBe('A1, A2, A3');
    expect(authorsShort(a(5))).toBe('A1, A2, A3 et al.');
    expect(authorsShort([])).toBe('No authors listed');
  });

  it('labels types, languages and citations', () => {
    expect(typeLabel('book-chapter')).toBe('Book chapter');
    expect(typeLabel('peer-review')).toBe('Peer review');
    expect(typeLabel(null)).toBeNull();
    expect(languageName('fr')).toBe('French');
    expect(citationLabel(1)).toBe('1 citation');
    expect(citationLabel(1694)).toBe('1,694 citations');
  });

  it('explains every notice', () => {
    const ctx = { mode: 'smart' as const, total: 98, maxQueryChars: 1500 };
    expect(noticeText('query_truncated', ctx)).toContain('1,500 characters');
    expect(noticeText('results_capped', ctx)).toContain('best 98 matches');
    expect(noticeText('results_capped', { ...ctx, mode: 'semantic' })).toContain('50 closest');
    expect(noticeText('filtered_top_results', ctx)).toContain('top matches only');
  });
});
