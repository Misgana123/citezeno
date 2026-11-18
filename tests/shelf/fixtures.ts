import type { Paper } from '@/lib/papers/types';

/* A complete Paper in the Citezeno format, for Shelf tests. */
export function paper(id: string, over: Partial<Paper> = {}): Paper {
  return {
    id,
    openalexId: id,
    doi: `10.1000/${id.toLowerCase()}`,
    title: `Paper ${id}`,
    authors: [{ name: 'Ada Lovelace', orcid: null }],
    year: 2020,
    publicationDate: '2020-01-01',
    source: 'Journal of Tests',
    type: 'article',
    language: 'en',
    abstract: 'An abstract.',
    citedByCount: 5,
    isOpenAccess: true,
    pdfUrl: null,
    landingUrl: null,
    isRetracted: false,
    topics: [],
    referencedWorkIds: [],
    ...over,
  };
}
