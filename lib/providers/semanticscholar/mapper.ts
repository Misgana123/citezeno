import { doiUrl, paperId, toDoi } from '@/lib/papers/ids';
import type { Paper } from '@/lib/papers/types';
import { clean, dateParts, plain } from '../papers/parse';
import { s2Url, toS2Id } from './ids';
import type { S2Paper } from './types';

export const PROVIDER = 'semanticscholar';

/* The fields asked for with every paper. */
export const FIELDS = 'paperId,externalIds,url,title,abstract,year,publicationDate,venue,journal,authors,citationCount,isOpenAccess,openAccessPdf,publicationTypes,fieldsOfStudy';

function kind(types: string[] | null | undefined): string {
  const t = types ?? [];
  if (t.includes('Review')) return 'review';
  if (t.includes('Editorial')) return 'editorial';
  if (t.includes('LettersAndComments')) return 'letter';
  if (t.includes('Dataset')) return 'dataset';
  if (t.includes('Book')) return 'book';
  if (t.includes('BookSection')) return 'book-chapter';
  return 'article';
}

export function toPaper(p: S2Paper | null | undefined): Paper | null {
  const id = toS2Id(p?.paperId);
  if (!p || !id) return null;
  const doi = toDoi(p.externalIds?.DOI);
  const { date } = dateParts(p.publicationDate);
  return {
    id: paperId(PROVIDER, id),
    provider: PROVIDER,
    record: { label: 'Semantic Scholar', url: s2Url(id) },
    doi,
    title: plain(p.title) ?? 'Untitled',
    authors: (p.authors ?? []).map((a) => clean(a.name)).filter((n): n is string => !!n).map((name) => ({ name, orcid: null })),
    year: Number.isInteger(p.year) ? (p.year as number) : dateParts(p.publicationDate).year,
    publicationDate: date,
    source: clean(p.journal?.name) ?? clean(p.venue),
    type: p.externalIds?.ArXiv && !p.journal?.name ? 'preprint' : kind(p.publicationTypes),
    language: null,
    abstract: plain(p.abstract),
    citedByCount: Math.max(0, Number(p.citationCount) || 0),
    isOpenAccess: p.isOpenAccess === true,
    pdfUrl: clean(p.openAccessPdf?.url),
    license: clean(p.openAccessPdf?.license)?.toLowerCase() ?? null,
    landingUrl: doi ? doiUrl(doi) : s2Url(id),
    isRetracted: false,
    topics: (p.fieldsOfStudy ?? []).map(clean).filter((t): t is string => !!t),
    referenceIds: [],
  };
}

export const toPapers = (ps: (S2Paper | null)[] | null | undefined): Paper[] => (ps ?? []).map(toPaper).filter((p): p is Paper => p != null);
