/* "Very similar title plus the same year": the possible-duplicate rule.
   Titles are compared after normalizing case, accents, punctuation and spacing,
   by the overlap of their three-letter chunks (Dice coefficient), so small
   differences ("large-scale" / "large scale", a typo, a subtitle colon) still
   match while different papers on the same topic don't. */

export const TITLE_THRESHOLD = 0.88;
/* Below this many characters a title must match exactly after normalizing. */
const SHORT_TITLE = 16;

export function normalizeTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ') // markup some sources leave in titles
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function trigrams(s: string): Map<string, number> {
  const padded = `  ${s} `;
  const out = new Map<string, number>();
  for (let i = 0; i < padded.length - 2; i++) {
    const g = padded.slice(i, i + 3);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

/* 0 (nothing alike) to 1 (the same after normalizing). */
export function titleSimilarity(a: string, b: string): number {
  const x = normalizeTitle(a);
  const y = normalizeTitle(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (Math.min(x.length, y.length) < SHORT_TITLE) return 0;
  const tx = trigrams(x);
  const ty = trigrams(y);
  let shared = 0;
  let total = 0;
  for (const [g, n] of tx) {
    shared += Math.min(n, ty.get(g) ?? 0);
    total += n;
  }
  for (const n of ty.values()) total += n;
  return (2 * shared) / total;
}

/* sharedId: the shared record's paper ID (null for private papers). */
export type DupKey = { title: string; year: number | null; doi: string | null; sharedId: string | null };

/* Why two papers look like the same one, or null. Exact matches (same record
   or DOI) are refused when saving, but can still meet here when a refresh
   fills in a DOI later. */
export function duplicateReason(a: DupKey, b: DupKey): 'same_id' | 'same_doi' | 'similar_title' | null {
  if (a.sharedId && a.sharedId === b.sharedId) return 'same_id';
  if (a.doi && a.doi === b.doi) return 'same_doi';
  if (a.year === b.year && titleSimilarity(a.title, b.title) >= TITLE_THRESHOLD) return 'similar_title';
  return null;
}
