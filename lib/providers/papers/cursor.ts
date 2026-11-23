/* Some sources page with a cursor ("next page token") instead of page numbers
   (Europe PMC, ClinicalTrials.gov). Page N means walking N-1 cursors first;
   each step is a normal gateway call, so pages a user already saw come from the
   cache. Deep pages are capped to keep a single request to a few calls. */

export const MAX_CURSOR_PAGE = 5;

export type CursorPage<T> = { items: T[]; total: number; next: string | null };

/* Fetch page `page` (1-based) through `fetchPage(cursor)`; the first page has a null cursor. */
export async function cursorPage<T>(page: number, fetchPage: (cursor: string | null) => Promise<CursorPage<T>>, maxPage = MAX_CURSOR_PAGE): Promise<CursorPage<T>> {
  let cursor: string | null = null;
  const target = Math.max(1, Math.min(page, maxPage));
  for (let p = 1; ; p++) {
    const r = await fetchPage(cursor);
    if (p >= target) return page > maxPage ? { items: [], total: r.total, next: null } : r;
    if (!r.next || !r.items.length) return { items: [], total: r.total, next: null };
    cursor = r.next;
  }
}
