/* Identifier helpers: Citezeno paper IDs, DOIs and ORCIDs. No imports: safe for
   client components. Each provider's own ID format lives in its adapter. */

/* Provider names: lowercase letters, digits and dashes. */
const PAPER_ID = /^([a-z][a-z0-9-]{0,31}):(\S{1,200})$/;

/* "openalex" + "W123" → "openalex:W123". */
export const paperId = (provider: string, providerId: string) => `${provider}:${providerId}`;

/* "openalex:W123" → { provider: "openalex", providerId: "W123" }; anything else → null. */
export function splitPaperId(id: string | null | undefined): { provider: string; providerId: string } | null {
  const m = id?.trim().match(PAPER_ID);
  return m ? { provider: m[1], providerId: m[2] } : null;
}

/* "https://doi.org/10.1/ABC" or "doi:10.1/abc" → "10.1/abc" (DOIs are case-insensitive). */
export function toDoi(value: string | null | undefined): string | null {
  if (!value) return null;
  const bare = value.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  return /^10\.\d{4,9}\/\S+$/.test(bare) ? bare.toLowerCase() : null;
}

export const doiUrl = (doi: string) => `https://doi.org/${doi}`;

/* "https://orcid.org/0000-0001-2345-6789" → "0000-0001-2345-6789". */
export function toOrcid(value: string | null | undefined): string | null {
  const m = value?.match(/(\d{4}-\d{4}-\d{4}-\d{3}[\dX])$/i);
  return m ? m[1].toUpperCase() : null;
}
