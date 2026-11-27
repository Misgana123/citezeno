'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PaperList } from '@/lib/papers/search/types';
import type { Paper } from '@/lib/papers/types';
import { fetchPaperList, PapersApiError } from './api';
import { cachedList, forgetList, rememberList } from './listCache';

/* Loads a paper list (search or related) page by page.
   `buildUrl(page)` names the request; when it changes the list starts over,
   unless this tab loaded the same list in the last few minutes: then it is
   shown at once, with every page loaded before (listCache.ts). Retry always
   loads afresh. Pass null to load nothing. Older requests are cancelled. */

export type ListStatus = 'idle' | 'loading' | 'ready' | 'more' | 'error';

/* Any paged list of papers: search results, related lists, the Explore feed. */
export type PagedPapers = { papers: Paper[]; total: number; page: number; hasMore: boolean };

export type PaperListState<L extends PagedPapers = PaperList> = {
  status: ListStatus;
  papers: Paper[];
  meta: Omit<L, 'papers'> | null;
  error: PapersApiError | null;
  loadMore(): void;
  retry(): void;
};

export function usePaperList<L extends PagedPapers = PaperList>(buildUrl: ((page: number) => string) | null): PaperListState<L> {
  const [status, setStatus] = useState<ListStatus>('idle');
  const [papers, setPapers] = useState<Paper[]>([]);
  const [meta, setMeta] = useState<PaperListState<L>['meta']>(null);
  const [error, setError] = useState<PapersApiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const ctrl = useRef<AbortController | null>(null);
  const key = buildUrl ? buildUrl(1) : null;
  const builder = useRef(buildUrl);
  builder.current = buildUrl;
  const listKey = useRef(key);
  listKey.current = key;
  const skipCache = useRef(false); // set by retry: load afresh once

  const load = useCallback(async (page: number) => {
    const build = builder.current;
    if (!build) return;
    ctrl.current?.abort();
    const c = (ctrl.current = new AbortController());
    setStatus(page === 1 ? 'loading' : 'more');
    setError(null);
    try {
      const { papers: next, ...rest } = await fetchPaperList<L>(build(page), c.signal);
      if (c.signal.aborted) return;
      // a paper can move between pages of a live index; never show it twice
      setPapers((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const all = page === 1 ? next : [...prev, ...next.filter((p) => !seen.has(p.id))];
        if (listKey.current) rememberList(listKey.current, all, rest);
        return all;
      });
      setMeta(rest);
      setStatus('ready');
    } catch (e) {
      if ((e as Error).name === 'AbortError' || c.signal.aborted) return;
      setError(e instanceof PapersApiError ? e : new PapersApiError('unavailable', 'Paper search is temporarily unavailable. Please try again shortly.'));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (!key) {
      ctrl.current?.abort();
      setStatus('idle');
      setPapers([]);
      setMeta(null);
      setError(null);
      return;
    }
    const seen = skipCache.current ? null : cachedList(key);
    skipCache.current = false;
    if (seen) {
      ctrl.current?.abort();
      setPapers(seen.papers);
      setMeta(seen.meta as Omit<L, 'papers'>); // the same URL always gives the same kind of list
      setError(null);
      setStatus('ready');
      return;
    }
    setPapers([]);
    setMeta(null);
    void load(1);
    return () => ctrl.current?.abort();
  }, [key, attempt, load]);

  const loadMore = useCallback(() => {
    if (meta?.hasMore && status === 'ready') void load(meta.page + 1);
  }, [meta, status, load]);

  const retry = useCallback(() => {
    // after a failed "load more", retry that page; otherwise start over
    if (meta && papers.length) void load(meta.page + 1);
    else {
      if (key) forgetList(key);
      skipCache.current = true;
      setAttempt((n) => n + 1);
    }
  }, [meta, papers.length, load, key]);

  return { status, papers, meta, error, loadMore, retry };
}
