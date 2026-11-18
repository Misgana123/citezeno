/* Identifier helpers for OpenAlex work IDs and DOIs. */

const WORK_ID = /^W\d{1,12}$/;

/* "https://openalex.org/W123" or "w123" → "W123"; anything else → null. */
export function toWorkId(value: string | null | undefined): string | null {
  if (!value) return null;
  const tail = value.trim().replace(/^https?:\/\/(www\.)?openalex\.org\//i, '').toUpperCase();
  return WORK_ID.test(tail) ? tail : null;
}

export const isWorkId = (value: string) => WORK_ID.test(value);

/* "https://doi.org/10.1/ABC" or "doi:10.1/abc" → "10.1/abc" (DOIs are case-insensitive). */
export function toDoi(value: string | null | undefined): string | null {
  if (!value) return null;
  const bare = value.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  return /^10\.\d{4,9}\/\S+$/.test(bare) ? bare.toLowerCase() : null;
}

export const doiUrl = (doi: string) => `https://doi.org/${doi}`;
export const openalexUrl = (workId: string) => `https://openalex.org/${workId}`;

/* "https://orcid.org/0000-0001-2345-6789" → "0000-0001-2345-6789". */
export function toOrcid(value: string | null | undefined): string | null {
  const m = value?.match(/(\d{4}-\d{4}-\d{4}-\d{3}[\dX])$/i);
  return m ? m[1].toUpperCase() : null;
}
