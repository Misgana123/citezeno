/* A small on-device library of recent traces, kept in localStorage. */
import type { Result, Source } from './types';

export type Saved = {
  id: string;
  savedAt: number;
  title: string;
  draft: string;
  style: string;
  mode: string;
  sources: number;
  result: {
    analysis: Result['analysis'];
    claims: Result['claims'];
    db: [string, Source][];
    extra: string[];
    requested: number;
    pins?: Record<string, string>;
  };
};

const KEY = 'cz:library';
const MAX = 12;

export function loadLibrary(): Saved[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as Saved[];
  } catch {
    return [];
  }
}

function write(list: Saved[]) {
  // drop the oldest entries until it fits in storage
  for (let n = list.length; n > 0; n--) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list.slice(0, n)));
      return;
    } catch {
      /* quota: try with fewer */
    }
  }
}

export function toSaved(id: string, title: string, draft: string, style: string, mode: string, r: Result): Saved {
  // keep only works that are cited or are candidates, with shortened abstracts
  const keep = new Set<string>(r.extra);
  r.claims.forEach((c) => c.cands.forEach((x) => keep.add(x.id)));
  const db: [string, Source][] = [];
  r.db.forEach((s, k) => keep.has(k) && db.push([k, { ...s, abstract: (s.abstract || '').slice(0, 500) }]));
  const analysis = {
    ...r.analysis,
    sentences: r.analysis.sentences.map((s) => ({ text: s.text, para: s.para, index: s.index, score: s.score, keywords: s.keywords })),
  };
  const cited = new Set<string>();
  r.claims.forEach((c) => c.ids.forEach((x) => cited.add(x)));
  r.extra.forEach((x) => cited.add(x));
  return {
    id, savedAt: Date.now(), title, draft, style, mode, sources: cited.size,
    result: { analysis, claims: r.claims, db, extra: r.extra, requested: r.requested, pins: r.pins },
  };
}

export function fromSaved(s: Saved): Result {
  return { ...s.result, db: new Map(s.result.db) };
}

export function upsert(entry: Saved): Saved[] {
  const list = [entry, ...loadLibrary().filter((x) => x.id !== entry.id)].slice(0, MAX);
  write(list);
  return list;
}

export function removeEntry(id: string): Saved[] {
  const list = loadLibrary().filter((x) => x.id !== id);
  write(list);
  return list;
}

export function timeAgo(t: number) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} day${d > 1 ? 's' : ''} ago`;
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
