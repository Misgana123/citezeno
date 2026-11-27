'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PageBox } from '@/lib/providers/pdf-text/types';
import { Icon } from '../../Icon';
import type { PdfControls } from '../pdf/PdfPane';
import { hits, locateQuote, pageOf } from './anchor';
import type { Annotations, Highlight, PageNote } from './useAnnotations';

/* Draws highlights, page-note pins and passage flashes on the PDF's pages.
   Each page gets two layers PDF.js leaves alone: highlights under the text (so
   text stays selectable) and pins above it. PDF.js redraws pages on zoom, so
   the layers are put back each time a page's text is drawn (`tick`).

   Highlights made on another copy of the PDF are found again by their text;
   ones that can't be found are reported (`onMissing`) for the Notes panel. */

export type Flash = { page: number; rects: PageBox[]; key: number };
type Layers = Map<number, { under: HTMLElement; over: HTMLElement }>;

function ensureLayers(pdf: PdfControls, page: number): { under: HTMLElement; over: HTMLElement } | null {
  const el = pdf.pageElement(page);
  if (!el) return null;
  let under = el.querySelector<HTMLElement>(':scope > .rd-ann-under');
  if (!under) {
    under = document.createElement('div');
    under.className = 'rd-ann-under';
    const text = el.querySelector(':scope > .textLayer');
    el.insertBefore(under, text ?? null);
  }
  let over = el.querySelector<HTMLElement>(':scope > .rd-ann-over');
  if (!over) {
    over = document.createElement('div');
    over.className = 'rd-ann-over';
    el.appendChild(over);
  }
  return { under, over };
}

export function AnnotationLayer({
  pdf,
  pdfKey,
  rendered,
  tick,
  ann,
  flash,
  placing,
  onPlace,
  onOpenHighlight,
  onOpenNote,
  onMissing,
}: {
  pdf: PdfControls;
  pdfKey: string | null;
  rendered: Set<number>;
  tick: number;
  ann: Annotations;
  flash: Flash | null;
  placing: boolean;
  onPlace(page: number, x: number, y: number, at: { left: number; top: number }): void;
  onOpenHighlight(h: Highlight, at: { left: number; top: number }): void;
  onOpenNote(n: PageNote, at: { left: number; top: number }): void;
  onMissing(ids: Set<string>): void;
}) {
  const [layers, setLayers] = useState<Layers>(new Map());
  const [found, setFound] = useState<Map<string, PageBox[] | null>>(new Map());

  // (re)attach the layers of every page whose text has been drawn
  useEffect(() => {
    setLayers((prev) => {
      let changed = false;
      const next: Layers = new Map(prev);
      for (const page of rendered) {
        const l = ensureLayers(pdf, page);
        if (!l) continue;
        const old = prev.get(page);
        if (!old || old.under !== l.under || old.over !== l.over) {
          next.set(page, l);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pdf, rendered, tick]);

  // highlights from another copy of the PDF: find their text on the page again
  const foreign = useMemo(() => ann.highlights.filter((h) => !h.id.startsWith('tmp_') && pdfKey && h.pdfKey !== pdfKey), [ann.highlights, pdfKey]);
  const changeRef = useRef(ann.changeHighlight);
  changeRef.current = ann.changeHighlight;
  useEffect(() => {
    const updates = new Map<string, PageBox[] | null>();
    for (const h of foreign) {
      if (found.has(h.id) || !rendered.has(h.page)) continue;
      const el = pdf.pageElement(h.page);
      if (!el?.querySelector('.textLayer span')) continue;
      const boxes = locateQuote(el, h.quote, h.prefix);
      updates.set(h.id, boxes);
      // remember the new place for this copy
      if (boxes) void changeRef.current(h.id, { rects: boxes, pdfKey });
    }
    if (updates.size) setFound((f) => new Map([...f, ...updates]));
  }, [foreign, rendered, tick, pdf, found, pdfKey]);

  const missing = useMemo(() => new Set([...found].filter(([id, b]) => b === null && foreign.some((h) => h.id === id)).map(([id]) => id)), [found, foreign]);
  const missingKey = [...missing].sort().join(',');
  const onMissingRef = useRef(onMissing);
  onMissingRef.current = onMissing;
  useEffect(() => onMissingRef.current(missing), [missingKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const boxesOf = (h: Highlight): PageBox[] | null => (h.pdfKey === pdfKey || h.id.startsWith('tmp_') || !pdfKey ? h.rects : (found.get(h.id) ?? null));

  // clicks: open a highlight, or place a page note
  const latest = useRef({ highlights: ann.highlights, boxesOf, placing, onPlace, onOpenHighlight });
  latest.current = { highlights: ann.highlights, boxesOf, placing, onPlace, onOpenHighlight };
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const page = pageOf(e.target as Node);
      if (!page) return;
      const r = page.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      const n = Number(page.dataset.pageNumber);
      const L = latest.current;
      if (L.placing) {
        e.preventDefault();
        L.onPlace(n, x, y, { left: e.clientX, top: e.clientY });
        return;
      }
      if (!window.getSelection()?.isCollapsed) return;
      const hit = [...L.highlights].reverse().find((h) => h.page === n && hits(L.boxesOf(h) ?? [], x, y));
      if (hit) L.onOpenHighlight(hit, { left: e.clientX, top: e.clientY });
    };
    const c = pdf.container;
    c.addEventListener('click', onClick);
    return () => c.removeEventListener('click', onClick);
  }, [pdf]);

  return (
    <>
      {[...layers].map(([page, l]) => (
        <PageLayers key={page} l={l} page={page} highlights={ann.highlights.filter((h) => h.page === page)} notes={ann.notes.filter((n) => n.page === page)} boxesOf={boxesOf} flash={flash?.page === page ? flash : null} onOpenNote={onOpenNote} />
      ))}
    </>
  );
}

function PageLayers({
  l,
  highlights,
  notes,
  boxesOf,
  flash,
  onOpenNote,
}: {
  l: { under: HTMLElement; over: HTMLElement };
  page: number;
  highlights: Highlight[];
  notes: PageNote[];
  boxesOf(h: Highlight): PageBox[] | null;
  flash: Flash | null;
  onOpenNote(n: PageNote, at: { left: number; top: number }): void;
}) {
  const pct = (b: PageBox) => ({ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` });
  return (
    <>
      {createPortal(
        <>
          {highlights.map((h) =>
            (boxesOf(h) ?? []).map((b, i) => <span key={`${h.id}-${i}`} className={`rd-hl c-${h.color}${h.note ? ' has-note' : ''}`} style={pct(b)} data-hl={h.id} />),
          )}
          {flash && flash.rects.map((b, i) => <span key={`f-${flash.key}-${i}`} className="rd-flash" style={pct(b)} />)}
        </>,
        l.under,
      )}
      {createPortal(
        <>
          {highlights
            .filter((h) => h.note)
            .map((h) => {
              const first = (boxesOf(h) ?? [])[0];
              return first ? <span key={`m-${h.id}`} className={`rd-hl-mark c-${h.color}`} style={{ left: `${Math.min(97, (first.x + first.w) * 100)}%`, top: `${first.y * 100}%` }} aria-hidden="true" /> : null;
            })}
          {notes.map((n) => (
            <button
              key={n.id}
              type="button"
              className="rd-pin"
              style={{ left: `${n.x * 100}%`, top: `${n.y * 100}%` }}
              title={n.text}
              aria-label={`Page note: ${n.text}`}
              onClick={(e) => {
                e.stopPropagation();
                const r = e.currentTarget.getBoundingClientRect();
                onOpenNote(n, { left: r.right, top: r.top });
              }}
            >
              <Icon name="pencil" />
            </button>
          ))}
        </>,
        l.over,
      )}
    </>
  );
}
