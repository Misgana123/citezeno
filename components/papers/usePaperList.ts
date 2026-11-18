'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PaperList } from '@/lib/papers/search/types';
import type { Paper } from '@/lib/papers/types';
import { fetchPaperList, PapersApiError } from './api';

/* Loads a paper list (search or related) page by page.
   `buildUrl(page)` names the request; when it changes the list starts over.
   Pass null to load nothing. Older requests are cancelled. */

export type ListStatus = 'idle' | 'loading' | 'ready' | 'more' | 'error';

export type PaperListState = {
  status: ListStatus;
  papers: Paper[];
  meta: Omit<PaperList, 'papers'> | null;
  error: PapersApiError | null;
  loadMore(): void;
  retry(): void;
};

export function usePaperList(buildUrl: ((page: number) => string) | null): PaperListState {
  const [status, setStatus] = useState<ListStatus>('idle');
  const [papers, setPapers] = useState<Paper[]>([]);
  const [meta, setMeta] = useState<PaperListState['meta']>(null);
  const [error, setError] = useState<PapersApiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const ctrl = useRef<AbortController | null>(null);
  const key = buildUrl ? buildUrl(1) : null;
  const builder = useRef(buildUrl);
  builder.current = buildUrl;

  const load = useCallback(async (page: number) => {
    const build = builder.current;
    if (!build) return;
    ctrl.current?.abort();
    const c = (ctrl.current = new AbortController());
    setStatus(page === 1 ? 'loading' : 'more');
    setError(null);
    try {
      const { papers: next, ...rest } = await fetchPaperList(build(page), c.signal);
      if (c.signal.aborted) return;
      // a paper can move between pages of a live index; never show it twice
      setPapers((prev) => {
        if (page === 1) return next;
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...next.filter((p) => !seen.has(p.id))];
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
    else setAttempt((n) => n + 1);
  }, [meta, papers.length, load]);

  return { status, papers, meta, error, loadMore, retry };
}
