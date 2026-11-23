import { describe, expect, it } from 'vitest';
import { appliedFilters, clearAll, DEFAULT_EXPLORE, exploreFromParams, exploreToParams, feedParams, searchParams, toSearchState } from '@/components/papers/exploreState';
import { compactCount } from '@/components/papers/format';

/* The Explore page's state in the URL, and what it sends to the feed and to search. */

const labels = { type: (t: string) => t, source: (s: string) => s, lang: (l: string) => l };

describe('explore state', () => {
  it('round-trips through the page URL, keeping only what differs from the defaults', () => {
    const s = exploreFromParams(new URLSearchParams('subject=Medicine&sort=cited&type=review&type=preprint&source=arxiv&from=2020&oa=1&pdf=1&minCites=100&lang=en&bogus=1&type=poem'));
    expect(s).toMatchObject({ subject: 'Medicine', sort: 'cited', types: ['review', 'preprint'], sources: ['arxiv'], from: '2020', oa: true, pdf: true, minCites: '100', lang: 'en' });
    expect(exploreFromParams(exploreToParams(s))).toEqual(s);
    expect(exploreToParams(DEFAULT_EXPLORE).toString()).toBe('');
  });

  it('sends the feed its filters, and search only the filters search can apply', () => {
    const s = { ...DEFAULT_EXPLORE, q: ' crispr ', mode: 'keyword' as const, order: 'newest' as const, subject: 'Medicine', sources: ['arxiv'], pdf: true, types: ['review' as const], from: '2020' };
    expect(feedParams(s, 2).toString()).toBe('subject=Medicine&source=arxiv&pdf=1&type=review&from=2020&page=2');
    expect(searchParams(s).toString()).toBe('q=crispr&mode=keyword&sort=newest&type=review&from=2020');
    expect(toSearchState(s)).toMatchObject({ q: ' crispr ', mode: 'keyword', sort: 'newest', type: 'review', from: '2020' });
  });

  it('lists applied filters as pills (source and PDF only on the feed) and clears them', () => {
    const s = { ...DEFAULT_EXPLORE, subject: 'Medicine', types: ['review' as const], sources: ['arxiv'], pdf: true, from: '2020', to: '2024', minCites: '100' as const };
    expect(appliedFilters(s, labels, false).map((f) => f.label)).toEqual(['review', '2020 – 2024', 'Has free PDF', 'arxiv', '100+ citations']);
    expect(appliedFilters(s, labels, true).map((f) => f.label)).toEqual(['review', '2020 – 2024', '100+ citations']);
    expect(clearAll(s)).toEqual({ ...DEFAULT_EXPLORE, subject: 'Medicine' });
  });

  it('shortens big numbers for cards', () => {
    expect([389, 4120, 31840, 148210, 2_400_000].map(compactCount)).toEqual(['389', '4.1k', '32k', '148k', '2.4M']);
  });
});
