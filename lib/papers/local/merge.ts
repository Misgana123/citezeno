import type { Paper } from '../types';

/* How a paper arriving again merges with the copy we keep. The Postgres store
   does the same in SQL (pg.ts); the in-memory store uses this.

   - The provider that owns the row (whoever sent it first) keeps owning it,
     so a paper's ID never changes under a user.
   - The owner's newer record replaces ours, except that a result card never
     wipes the full details (topics, references) we already have.
   - Another provider's copy of the same paper (same DOI) only fills gaps:
     a missing abstract, PDF link or subject. */

export type Kept = { data: Paper; detail: boolean; ids: string[]; fetchedAt: number };

export function mergePaper(old: Kept, incoming: Paper, detail: boolean, now: number): Kept {
  const ids = old.ids.includes(incoming.id) ? old.ids : [...old.ids, incoming.id];
  if (old.data.provider !== incoming.provider) {
    const data = { ...old.data };
    if (!data.abstract && incoming.abstract) data.abstract = incoming.abstract;
    if (!data.pdfUrl && incoming.pdfUrl) data.pdfUrl = incoming.pdfUrl;
    if (!data.subject && incoming.subject) data.subject = incoming.subject;
    return { ...old, data, ids };
  }
  if (detail || !old.detail) return { data: incoming, detail: old.detail || detail, ids, fetchedAt: now };
  const { topics: _t, referenceIds: _r, ...card } = incoming;
  return { data: { ...old.data, ...card }, detail: true, ids, fetchedAt: now };
}
