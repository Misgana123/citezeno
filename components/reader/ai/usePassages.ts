'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoredPassage } from '@/lib/reader/store/passages';
import { readerFetch, readerUrl } from '../api';

export type PassageRef = Pick<StoredPassage, 'id' | 'page' | 'section' | 'box' | 'text'>;

/* The paper's passages by ID, for citation links in summaries and answers.
   Loaded when the text is ready (and again when it changes). */
export function usePassages(paperId: string, pdfId: string | null, ready: boolean) {
  const [byId, setById] = useState<Map<string, PassageRef>>(new Map());
  const loading = useRef(false);
  const load = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      const r = await readerFetch<{ passages: PassageRef[] }>(readerUrl(paperId, `/passages${pdfId ? `?pdf=${encodeURIComponent(pdfId)}` : ''}`));
      setById(new Map(r.passages.map((p) => [p.id, p])));
    } catch {
      /* links just won't jump until the next try */
    } finally {
      loading.current = false;
    }
  }, [paperId, pdfId]);
  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);
  return byId;
}
