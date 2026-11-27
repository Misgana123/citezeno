import type { Paper } from '@/lib/papers/types';

/* "W1" → "openalex:W1" (the Citezeno paper ID of an OpenAlex work). */
export const oa = (workId: string) => (workId.includes(':') ? workId : `openalex:${workId}`);

/* A complete Paper in the Citezeno format, for Shelf tests. `id` may be a bare OpenAlex work ID. */
export function paper(id: string, over: Partial<Paper> = {}): Paper {
  const work = id.replace(/^openalex:/, '');
  return {
    id: oa(id),
    provider: 'openalex',
    record: { label: 'OpenAlex', url: `https://openalex.org/${work}` },
    doi: `10.1000/${work.toLowerCase()}`,
    title: `Paper ${work}`,
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
    referenceIds: [],
    ...over,
  };
}
