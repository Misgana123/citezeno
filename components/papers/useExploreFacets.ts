'use client';

import { useEffect, useState } from 'react';
import type { ExploreFacets } from '@/lib/papers/explore/types';
import { fetchExploreFacets } from './api';

/* The Explore filter counts for the current filters. The last counts stay on
   screen while new ones load (no flicker), and counts seen in the last few
   minutes come back at once. Null: no counts to show (search, or the feed is
   the live listing). */

const TTL_MS = 5 * 60_000;
const seen = new Map<string, { f: ExploreFacets | null; at: number }>();

export function useExploreFacets(params: URLSearchParams | null): { facets: ExploreFacets | null; loading: boolean } {
  const key = params ? params.toString() : null;
  const [facets, setFacets] = useState<ExploreFacets | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (key == null) {
      setFacets(null);
      return;
    }
    const hit = seen.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) {
      setFacets(hit.f);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    fetchExploreFacets(new URLSearchParams(key), ctrl.signal)
      .then((f) => {
        seen.set(key, { f, at: Date.now() });
        if (seen.size > 40) seen.delete(seen.keys().next().value as string);
        setFacets(f);
      })
      .catch(() => {}) // counts are a nicety: the feed works without them
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, [key]);

  return { facets, loading };
}
