import type { Paper } from '../types';
import { mergePaper, type Kept } from './merge';
import { recordKey, type PaperCopyStore, type StoredPaper } from './types';

/* An in-memory paper copy: for tests, and for local runs without a database.
   It holds for one server process only. */

export type MemoryPaperCopy = PaperCopyStore & { readonly rows: Map<string, Kept & { seenAt: number; hits: number; origin: string }> };

export function memoryPaperCopy(now: () => number = Date.now): MemoryPaperCopy {
  const rows: MemoryPaperCopy['rows'] = new Map();
  const stored = (r: Kept): StoredPaper => ({ paper: structuredClone(r.data), detail: r.detail, fetchedAt: r.fetchedAt });
  return {
    rows,
    async save(papers: Paper[], { detail, origin }) {
      for (const p of papers) {
        const key = recordKey(p);
        const old = rows.get(key);
        const t = now();
        if (!old) rows.set(key, { data: structuredClone(p), detail, ids: [p.id], fetchedAt: t, seenAt: t, hits: 1, origin });
        else rows.set(key, { ...old, ...mergePaper(old, structuredClone(p), detail, t), seenAt: t, hits: old.hits + 1 });
      }
    },
    async byIds(ids) {
      const out = new Map<string, StoredPaper>();
      for (const r of rows.values()) for (const id of ids) if (r.ids.includes(id)) out.set(id, stored(r));
      return out;
    },
    async byDois(dois) {
      const out = new Map<string, StoredPaper>();
      for (const doi of dois) {
        const r = rows.get(`doi:${doi.toLowerCase()}`);
        if (r) out.set(doi.toLowerCase(), stored(r));
      }
      return out;
    },
    async touch(ids) {
      for (const r of rows.values()) {
        if (r.ids.some((id) => ids.includes(id))) {
          r.seenAt = now();
          r.hits++;
        }
      }
    },
  };
}
