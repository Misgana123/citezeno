'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../Icon';
import type { FindCount, PdfControls } from './pdf/PdfPane';

/* The reader's top bar: Back, the title (with a retraction warning), page
   number with jump, zoom and fit, search in the paper, panel toggles and the ⋯ menu. */
export function TopBar({
  title,
  retracted,
  pdf,
  page,
  scale,
  leftOpen,
  rightOpen,
  onBack,
  onLeft,
  onRight,
  onSearch,
  menu,
  compact,
}: {
  title: string;
  retracted: boolean;
  pdf: PdfControls | null;
  page: number;
  scale: number;
  leftOpen: boolean;
  rightOpen: boolean;
  onBack(): void;
  onLeft(): void;
  onRight(): void;
  onSearch(): void;
  menu: ReactNode;
  /* phones: the bottom bar holds the panels */
  compact: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <header className="rd-top">
      <button type="button" className="icon-btn rd-back" onClick={onBack} aria-label="Back">
        <Icon name="arrow" className="rd-back-ico" />
      </button>
      {!compact && pdf && (
        <button type="button" className="icon-btn" aria-pressed={leftOpen} onClick={onLeft} aria-label={leftOpen ? 'Hide pages' : 'Show pages'} title="Pages and contents ( [ )">
          <Icon name="list" />
        </button>
      )}
      <div className="rd-title" title={title}>
        {retracted && (
          <span className="rd-retracted-chip" title="This paper has been retracted">
            <Icon name="alert" /> Retracted
          </span>
        )}
        <span className="rd-title-text">{title}</span>
      </div>
      {pdf && (
        <div className="rd-tools">
          <form
            className="rd-page"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(draft);
              if (Number.isFinite(n)) pdf.goTo(n);
              setDraft(null);
            }}
          >
            <input
              aria-label="Page number"
              inputMode="numeric"
              value={draft ?? String(page)}
              onFocus={(e) => {
                setDraft(String(page));
                e.currentTarget.select();
              }}
              onBlur={() => setDraft(null)}
              onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 5))}
            />
            <span>/ {pdf.pageCount}</span>
          </form>
          {!compact && (
            <div className="rd-zoom">
              <button type="button" className="icon-btn" onClick={() => pdf.zoom(-1)} aria-label="Zoom out" title="Zoom out ( − )">
                <Icon name="minus" />
              </button>
              <ZoomMenu scale={scale} pdf={pdf} />
              <button type="button" className="icon-btn" onClick={() => pdf.zoom(1)} aria-label="Zoom in" title="Zoom in ( + )">
                <Icon name="plus" />
              </button>
            </div>
          )}
          <button type="button" className="icon-btn" onClick={onSearch} aria-label="Search in the paper" title="Search in the paper (Ctrl F)">
            <Icon name="search" />
          </button>
        </div>
      )}
      {menu}
      {!compact && (
        <button type="button" className="icon-btn" aria-pressed={rightOpen} onClick={onRight} aria-label={rightOpen ? 'Hide the side panel' : 'Show the side panel'} title="Chat, notes and details ( ] )">
          <Icon name="panel" className="rd-flip" />
        </button>
      )}
    </header>
  );
}

function ZoomMenu({ scale, pdf }: { scale: number; pdf: PdfControls }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const pick = (v: Parameters<PdfControls['setScale']>[0]) => {
    pdf.setScale(v);
    setOpen(false);
  };
  return (
    <div className="rd-menu-wrap" ref={ref}>
      <button type="button" className="btn btn-ghost btn-sm rd-zoom-val" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        {Math.round(scale * 100)}%
      </button>
      {open && (
        <div className="rd-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => pick('page-width')}>
            Fit to width
          </button>
          <button type="button" role="menuitem" onClick={() => pick('page-fit')}>
            Fit to page
          </button>
          <hr />
          {[0.75, 1, 1.25, 1.5, 2].map((s) => (
            <button key={s} type="button" role="menuitem" onClick={() => pick(s)}>
              {s * 100}%
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* The ⋯ menu: items are passed in, so the reader decides what applies. */
export function MoreMenu({ items }: { items: ({ label: string; icon: Parameters<typeof Icon>[0]['name']; onClick?(): void; href?: string; danger?: boolean } | null)[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  return (
    <div className="rd-menu-wrap" ref={ref}>
      <button type="button" className="icon-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="More">
        <span className="rd-dots" aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div className="rd-menu rd-menu-right" role="menu">
          {items.filter(Boolean).map((it) =>
            it!.href ? (
              <a key={it!.label} role="menuitem" href={it!.href} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
                <Icon name={it!.icon} /> {it!.label}
              </a>
            ) : (
              <button
                key={it!.label}
                type="button"
                role="menuitem"
                className={it!.danger ? 'is-danger' : undefined}
                onClick={() => {
                  setOpen(false);
                  it!.onClick?.();
                }}
              >
                <Icon name={it!.icon} /> {it!.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/* Search in the paper: every match highlighted, with a count; Enter for the next, Shift+Enter for the previous. */
export function FindBar({ pdf, count, notFound, onClose }: { pdf: PdfControls; count: FindCount | null; notFound: boolean; onClose(): void }) {
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    const t = setTimeout(() => (q.trim() ? pdf.find(q.trim()) : pdf.clearFind()), 220);
    return () => clearTimeout(t);
  }, [q, pdf]);
  const close = () => {
    pdf.clearFind();
    onClose();
  };
  return (
    <div className="rd-find" role="search">
      <Icon name="search" />
      <input
        ref={inputRef}
        value={q}
        placeholder="Find in this paper"
        aria-label="Find in this paper"
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close();
          if (e.key === 'Enter' && q.trim()) {
            e.preventDefault();
            pdf.find(q.trim(), { again: true, previous: e.shiftKey });
          }
        }}
      />
      <span className="rd-find-count" aria-live="polite">
        {q.trim() ? (notFound || (count && count.total === 0) ? 'No matches' : count ? `${count.current} of ${count.total}` : '…') : ''}
      </span>
      <button type="button" className="icon-btn" disabled={!q.trim()} onClick={() => pdf.find(q.trim(), { again: true, previous: true })} aria-label="Previous match">
        <Icon name="chevron" className="rd-up" />
      </button>
      <button type="button" className="icon-btn" disabled={!q.trim()} onClick={() => pdf.find(q.trim(), { again: true })} aria-label="Next match">
        <Icon name="chevron" className="rd-down" />
      </button>
      <button type="button" className="icon-btn" onClick={close} aria-label="Close search">
        <Icon name="x" />
      </button>
    </div>
  );
}

function useDismiss(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, open, close]);
}
