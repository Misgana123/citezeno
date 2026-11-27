'use client';

import { useEffect, useRef, useState } from 'react';
import type { Paper } from '@/lib/papers/types';
import { Icon } from '../Icon';
import { PaperDetails } from './PaperDetails';
import { RELATED, RELATED_KINDS, type RelatedKind } from './related';
import { RelatedList } from './RelatedList';
import type { SearchState } from './state';
import { usePaper } from './usePaper';

type View = { paper: Paper; tab: 'details' | RelatedKind };

/* The preview panel: a paper's details and its related lists. On wide screens
   it is docked beside the results (`docked`); otherwise it is the app's side
   drawer. Opening a paper from a related list stacks it; Back returns. */
export function PaperPreview({
  paper,
  filters,
  maxQueryChars,
  onClose,
  docked = false,
}: {
  paper: Paper;
  filters: SearchState;
  maxQueryChars: number;
  onClose: () => void;
  docked?: boolean;
}) {
  const [stack, setStack] = useState<View[]>([{ paper, tab: 'details' }]);
  const view = stack[stack.length - 1];
  const { paper: full, loading, error } = usePaper(view.paper.id, view.paper);
  const shown = full ?? view.paper;
  const closeRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // a new paper from the results replaces the whole stack
  useEffect(() => {
    setStack([{ paper, tab: 'details' }]);
  }, [paper]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // (braces matter: scrollTo returns a promise in newer browsers, and an effect may only return a cleanup)
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [stack.length, view.tab]);

  const setTab = (tab: View['tab']) => setStack((s) => [...s.slice(0, -1), { ...s[s.length - 1], tab }]);
  const open = (p: Paper) => setStack((s) => [...s, { paper: p, tab: 'details' }]);
  const back = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));

  const panel = (
    <aside className={docked ? 'fp-dock' : 'drawer fp-drawer'} role={docked ? 'complementary' : 'dialog'} aria-modal={docked ? undefined : true} aria-labelledby="fp-preview-title">
      <div className="fp-drawer-head">
        {stack.length > 1 ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={back}>
            <Icon name="arrow" className="fp-back-ico" /> Back
          </button>
        ) : (
          <span className="fp-drawer-kicker">Paper preview</span>
        )}
        <button type="button" className="icon-btn" ref={closeRef} onClick={onClose} aria-label="Close the preview">
          <Icon name="x" />
        </button>
      </div>

      <nav className="fp-tabs" aria-label="About this paper">
        <button type="button" aria-pressed={view.tab === 'details'} onClick={() => setTab('details')}>
          <Icon name="doc" /> Details
        </button>
        {RELATED_KINDS.map((k) => (
          <button key={k} type="button" aria-pressed={view.tab === k} onClick={() => setTab(k)}>
            <Icon name={RELATED[k].icon} /> {RELATED[k].label}
          </button>
        ))}
      </nav>

      <div className="fp-drawer-body" ref={bodyRef}>
        {view.tab === 'details' ? (
          <>
            {error && error.code !== 'not_found' && (
              <p className="fp-related-note">Some details could not be loaded. {error.message}</p>
            )}
            <PaperDetails paper={shown} loading={loading} />
          </>
        ) : (
          <>
            <p className="fp-related-of">
              {RELATED[view.tab].label}: <b>{shown.title}</b>
            </p>
            <RelatedList key={`${shown.id}-${view.tab}`} paperId={shown.id} kind={view.tab} filters={filters} maxQueryChars={maxQueryChars} onOpen={open} />
          </>
        )}
      </div>
    </aside>
  );

  if (docked) return panel;
  return (
    <div className="drawer-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      {panel}
    </div>
  );
}
