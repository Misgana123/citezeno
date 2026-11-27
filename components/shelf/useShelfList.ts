'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ShelfItem } from '@/lib/shelf/types';
import { ShelfApiError, shelfFetch } from './api';

/* Loads the shelf page by page for a query string; a new query starts over.
   Local changes (edit, remove) update the loaded items without a reload. */

type Page = { items: ShelfItem[]; total: number; page: number; perPage: number };
export type ShelfListStatus = 'loading' | 'ready' | 'more' | 'error';

export type ShelfListState = {
  status: ShelfListStatus;
  items: ShelfItem[];
  total: number;
  hasMore: boolean;
  error: ShelfApiError | null;
  loadMore(): void;
  reload(): void;
  replace(item: ShelfItem): void;
  drop(ids: string[]): void;
};

export function useShelfList(query: string): ShelfListState {
  const [status, setStatus] = useState<ShelfListStatus>('loading');
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [meta, setMeta] = useState<Omit<Page, 'items'> | null>(null);
  const [error, setError] = useState<ShelfApiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const ctrl = useRef<AbortController | null>(null);
  const queryRef = useRef(query);
  queryRef.current = query;

  const load = useCallback(async (page: number) => {
    ctrl.current?.abort();
    const c = (ctrl.current = new AbortController());
    setStatus(page === 1 ? 'loading' : 'more');
    setError(null);
    try {
      const qs = new URLSearchParams(queryRef.current);
      qs.set('page', String(page));
      const { items: next, ...rest } = await shelfFetch<Page>(`/api/shelf/papers?${qs}`, { signal: c.signal });
      if (c.signal.aborted) return;
      setItems((prev) => {
        if (page === 1) return next;
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...next.filter((i) => !seen.has(i.id))];
      });
      setMeta(rest);
      setStatus('ready');
    } catch (e) {
      if ((e as Error).name === 'AbortError' || c.signal.aborted) return;
      setError(e instanceof ShelfApiError ? e : new ShelfApiError('unavailable', 'Your shelf could not be loaded.'));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load(1);
    return () => ctrl.current?.abort();
  }, [query, attempt, load]);

  const hasMore = !!meta && meta.page * meta.perPage < meta.total;

  return {
    status,
    items,
    total: meta?.total ?? 0,
    hasMore,
    error,
    loadMore: useCallback(() => {
      if (hasMore && status === 'ready' && meta) void load(meta.page + 1);
    }, [hasMore, status, meta, load]),
    reload: useCallback(() => setAttempt((n) => n + 1), []),
    replace: useCallback((item: ShelfItem) => setItems((xs) => xs.map((x) => (x.id === item.id ? item : x))), []),
    drop: useCallback((ids: string[]) => {
      const gone = new Set(ids);
      setItems((xs) => xs.filter((x) => !gone.has(x.id)));
      setMeta((m) => (m ? { ...m, total: Math.max(0, m.total - ids.length) } : m));
    }, []),
  };
}
