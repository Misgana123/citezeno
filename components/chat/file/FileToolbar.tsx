'use client';

import { useEffect, useState } from 'react';
import { Icon } from '../../Icon';
import type { PdfControls } from '../../reader/pdf/PdfPane';

/* The open PDF's toolbar: page thumbnails, previous / next with a page box,
   zoom (click the value to fit the width), find, and highlights & notes. */
export function FileToolbar({
  pdf,
  page,
  scale,
  thumbs,
  notes,
  onThumbs,
  onFind,
  onNotes,
}: {
  pdf: PdfControls | null;
  page: number;
  scale: number;
  thumbs: boolean;
  notes: boolean;
  onThumbs(): void;
  onFind(): void;
  onNotes(): void;
}) {
  const [typed, setTyped] = useState(String(page));
  useEffect(() => setTyped(String(page)), [page]);
  const off = !pdf;
  return (
    <div className="cf-tools" role="toolbar" aria-label="PDF">
      <button type="button" className="cf-ib" aria-pressed={thumbs} onClick={onThumbs} disabled={off} title="Pages" aria-label="Show pages">
        <Icon name="panel" />
      </button>
      <span className="cf-sep" aria-hidden="true" />
      <button type="button" className="cf-ib" onClick={() => pdf?.prev()} disabled={off || page <= 1} title="Previous page" aria-label="Previous page">
        <Icon name="chevron" className="cf-flip" />
      </button>
      <span className="cf-page">
        <input
          value={typed}
          inputMode="numeric"
          aria-label="Page"
          disabled={off}
          onChange={(e) => setTyped(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && pdf?.goTo(Number(typed) || 1)}
          onBlur={() => (pdf && Number(typed) !== page ? pdf.goTo(Number(typed) || 1) : setTyped(String(page)))}
        />
        <span>/ {pdf?.pageCount ?? '–'}</span>
      </span>
      <button type="button" className="cf-ib" onClick={() => pdf?.next()} disabled={off || page >= (pdf?.pageCount ?? 1)} title="Next page" aria-label="Next page">
        <Icon name="chevron" />
      </button>
      <span className="cf-grow" />
      <button type="button" className="cf-ib" onClick={() => pdf?.zoom(-1)} disabled={off} title="Zoom out" aria-label="Zoom out">
        <Icon name="minus" />
      </button>
      <button type="button" className="cf-zoom" onClick={() => pdf?.setScale('page-width')} disabled={off} title="Fit width">
        {Math.round(scale * 100)}%
      </button>
      <button type="button" className="cf-ib" onClick={() => pdf?.zoom(1)} disabled={off} title="Zoom in" aria-label="Zoom in">
        <Icon name="plus" />
      </button>
      <span className="cf-sep" aria-hidden="true" />
      <button type="button" className="cf-ib" onClick={onFind} disabled={off} title="Find (Ctrl F)" aria-label="Find in the PDF">
        <Icon name="search" />
      </button>
      <button type="button" className="cf-ib" aria-pressed={notes} onClick={onNotes} title="Highlights & notes" aria-label="Highlights and notes">
        <Icon name="pencil" />
      </button>
    </div>
  );
}
