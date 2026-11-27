'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Highlight, HighlightColor, HighlightPatch, PageNote } from '@/lib/reader/store/annotations';
import { toast } from '../../toast';
import { readerFetch, readerUrl } from '../api';
import type { Anchor } from './anchor';

export type { Highlight, HighlightColor, PageNote };

export const COLORS: { id: HighlightColor; label: string }[] = [
  { id: 'yellow', label: 'Yellow' },
  { id: 'green', label: 'Green' },
  { id: 'blue', label: 'Blue' },
  { id: 'pink', label: 'Pink' },
  { id: 'purple', label: 'Purple' },
];

type AutoSaved = { itemId: string } | null;

/* The user's highlights and page notes on the open paper: loaded once, changed
   right away on screen and then saved (put back if saving fails). */
export function useAnnotations(paperId: string, pdfKey: string | null, onAutoSaved: (itemId: string) => void) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [notes, setNotes] = useState<PageNote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const url = readerUrl(paperId, '/highlights');

  useEffect(() => {
    let live = true;
    readerFetch<{ highlights: Highlight[]; notes: PageNote[] }>(url)
      .then((r) => {
        if (!live) return;
        setHighlights(r.highlights);
        setNotes(r.notes);
      })
      .catch(() => {})
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [url]);

  const fail = (e: unknown) => toast((e as Error)?.message || 'That couldn’t be saved. Please try again.', true);

  const addHighlight = useCallback(
    async (a: Anchor, color: HighlightColor, note: string | null = null): Promise<Highlight | null> => {
      const temp: Highlight = { id: `tmp_${Date.now()}`, paperId, ...a, color, note, pdfKey, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      setHighlights((hs) => [...hs, temp]);
      try {
        const r = await readerFetch<{ highlight: Highlight; autoSaved: AutoSaved }>(url, { method: 'POST', body: { kind: 'highlight', ...a, color, note, pdfKey } });
        setHighlights((hs) => hs.map((h) => (h.id === temp.id ? r.highlight : h)));
        if (r.autoSaved) onAutoSaved(r.autoSaved.itemId);
        return r.highlight;
      } catch (e) {
        setHighlights((hs) => hs.filter((h) => h.id !== temp.id));
        fail(e);
        return null;
      }
    },
    [paperId, pdfKey, url, onAutoSaved],
  );

  const changeHighlight = useCallback(
    async (id: string, patch: HighlightPatch) => {
      let before: Highlight | undefined;
      setHighlights((hs) => hs.map((h) => (h.id === id ? ((before = h), { ...h, ...patch }) : h)));
      try {
        const r = await readerFetch<{ highlight: Highlight }>(url, { method: 'PATCH', body: { kind: 'highlight', id, ...patch } });
        setHighlights((hs) => hs.map((h) => (h.id === id ? r.highlight : h)));
      } catch (e) {
        if (before) setHighlights((hs) => hs.map((h) => (h.id === id ? before! : h)));
        fail(e);
      }
    },
    [url],
  );

  const removeHighlight = useCallback(
    async (id: string) => {
      let gone: Highlight | undefined;
      setHighlights((hs) => hs.filter((h) => (h.id === id ? ((gone = h), false) : true)));
      try {
        await readerFetch(`${url}?kind=highlight&id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      } catch (e) {
        if (gone) setHighlights((hs) => [...hs, gone!]);
        fail(e);
      }
    },
    [url],
  );

  const addNote = useCallback(
    async (n: { page: number; x: number; y: number; text: string }) => {
      try {
        const r = await readerFetch<{ note: PageNote; autoSaved: AutoSaved }>(url, { method: 'POST', body: { kind: 'note', ...n } });
        setNotes((ns) => [...ns, r.note]);
        if (r.autoSaved) onAutoSaved(r.autoSaved.itemId);
        return r.note;
      } catch (e) {
        fail(e);
        return null;
      }
    },
    [url, onAutoSaved],
  );

  const changeNote = useCallback(
    async (id: string, patch: { text?: string; x?: number; y?: number }) => {
      setNotes((ns) => ns.map((n) => (n.id === id ? { ...n, ...patch } : n)));
      try {
        const r = await readerFetch<{ note: PageNote }>(url, { method: 'PATCH', body: { kind: 'note', id, ...patch } });
        setNotes((ns) => ns.map((n) => (n.id === id ? r.note : n)));
      } catch (e) {
        fail(e);
      }
    },
    [url],
  );

  const removeNote = useCallback(
    async (id: string) => {
      let gone: PageNote | undefined;
      setNotes((ns) => ns.filter((n) => (n.id === id ? ((gone = n), false) : true)));
      try {
        await readerFetch(`${url}?kind=note&id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      } catch (e) {
        if (gone) setNotes((ns) => [...ns, gone!]);
        fail(e);
      }
    },
    [url],
  );

  return { highlights, notes, loaded, addHighlight, changeHighlight, removeHighlight, addNote, changeNote, removeNote };
}

export type Annotations = ReturnType<typeof useAnnotations>;
