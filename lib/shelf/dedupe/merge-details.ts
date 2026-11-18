import type { ReadingStatus, ShelfPaper } from '../types';

/* Deciding what a merge keeps. */

/* How complete a paper's details are. An OpenAlex record always wins: it is
   shared, kept up to date and checked for retractions. */
export function completeness(p: ShelfPaper): number {
  return (
    (p.origin === 'openalex' ? 100 : 0) +
    (p.doi ? 5 : 0) +
    (p.abstract ? 3 : 0) +
    (p.authors.length ? 2 : 0) +
    (p.year != null ? 1 : 0) +
    (p.source ? 1 : 0) +
    (p.landingUrl ? 1 : 0) +
    (p.pdfUrl ? 1 : 0) +
    (p.citedByCount > 0 ? 1 : 0)
  );
}

/* Two private records: keep the first's details and fill every gap from the second. */
export function fillDetails(keep: ShelfPaper, other: ShelfPaper): ShelfPaper {
  const pick = <T,>(a: T, b: T) => (a == null || a === '' ? b : a);
  return {
    ...keep,
    doi: pick(keep.doi, other.doi),
    authors: keep.authors.length >= other.authors.length ? keep.authors : other.authors,
    year: pick(keep.year, other.year),
    publicationDate: pick(keep.publicationDate, other.publicationDate),
    source: pick(keep.source, other.source),
    type: pick(keep.type, other.type),
    language: pick(keep.language, other.language),
    abstract: pick(keep.abstract, other.abstract),
    citedByCount: Math.max(keep.citedByCount, other.citedByCount),
    isOpenAccess: keep.isOpenAccess || other.isOpenAccess,
    pdfUrl: pick(keep.pdfUrl, other.pdfUrl),
    landingUrl: pick(keep.landingUrl, other.landingUrl),
    isRetracted: keep.isRetracted || other.isRetracted,
    topics: [...new Set([...keep.topics, ...other.topics])],
    referencedWorkIds: keep.referencedWorkIds.length ? keep.referencedWorkIds : other.referencedWorkIds,
  };
}

const ORDER: ReadingStatus[] = ['to_read', 'reading', 'done'];
/* The further along of the two. */
export const furtherStatus = (a: ReadingStatus, b: ReadingStatus): ReadingStatus => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b);

/* Both notes, when they differ. */
export function joinNotes(a: string | null, b: string | null): string | null {
  const x = a?.trim();
  const y = b?.trim();
  if (!x) return y || null;
  if (!y || x === y) return x;
  return `${x}\n\n---\n\n${y}`;
}
