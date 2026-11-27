import type { Paper } from '@/lib/papers/types';

/* Paper lists already loaded in this tab, so going back to one (switching
   Smart → Exact keywords → Smart, or reopening a related list) shows it at
   once instead of loading it again. Keyed by the list's first-page URL; keeps
   every page loaded so far. Short-lived and small: results stay current, and
   memory stays bounded. */

export type CachedList = { papers: Paper[]; meta: unknown; savedAt: number };

export const LIST_TTL_MS = 10 * 60_000;
export const MAX_LISTS = 30;

const lists = new Map<string, CachedList>();

export function cachedList(key: string, now = Date.now()): CachedList | null {
  const hit = lists.get(key);
  if (!hit) return null;
  if (now - hit.savedAt > LIST_TTL_MS) {
    lists.delete(key);
    return null;
  }
  // most recently used last, so the oldest go first when full
  lists.delete(key);
  lists.set(key, hit);
  return hit;
}

export function rememberList(key: string, papers: Paper[], meta: unknown, now = Date.now()) {
  lists.delete(key);
  lists.set(key, { papers, meta, savedAt: now });
  while (lists.size > MAX_LISTS) lists.delete(lists.keys().next().value as string);
}

export const forgetList = (key: string) => void lists.delete(key);
