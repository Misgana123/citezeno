'use client';

import { useEffect, useState } from 'react';
import type { Paper } from '@/lib/papers/types';
import { fetchPaper, PapersApiError } from './api';

/* Full details for one paper. Starts from what the card already knows
   (`known`) so the preview shows at once, then fills in the rest. */
export function usePaper(id: string, known: Paper | null) {
  const [paper, setPaper] = useState<Paper | null>(known);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<PapersApiError | null>(null);

  useEffect(() => {
    const c = new AbortController();
    setPaper(known);
    setLoading(true);
    setError(null);
    fetchPaper(id, c.signal)
      .then((p) => !c.signal.aborted && setPaper(p))
      .catch((e) => {
        if (c.signal.aborted || (e as Error).name === 'AbortError') return;
        setError(e instanceof PapersApiError ? e : new PapersApiError('unavailable', 'Could not load this paper.'));
      })
      .finally(() => !c.signal.aborted && setLoading(false));
    return () => c.abort();
    // `known` only seeds the view; a new id is what starts a new load
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  return { paper, loading, error };
}
