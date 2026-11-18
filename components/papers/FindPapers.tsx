'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Paper } from '@/lib/papers/types';
import { Icon } from '../Icon';
import { listUrl } from './api';
import { FilterPanel } from './FilterPanel';
import { ModeSwitch } from './ModeSwitch';
import { PaperPreview } from './PaperPreview';
import { PaperResults } from './PaperResults';
import { SearchBox } from './SearchBox';
import { SortSelect } from './SortSelect';
import { activeFilterCount, clearFilters, type SearchState, stateFromParams, stateToParams } from './state';
import { usePaperList } from './usePaperList';

/* The Find Papers page: search box, mode, filters, sort and results.
   `draft` is what the form shows; `applied` is what was last searched.
   Mode, sort and filter changes re-run a search that has already been made;
   typing only searches on Enter / Search. The applied search lives in the URL. */
export function FindPapers({ initialQuery, maxQueryChars }: { initialQuery: string; maxQueryChars: number }) {
  const initial = useMemo(() => stateFromParams(new URLSearchParams(initialQuery)), [initialQuery]);
  const [draft, setDraft] = useState<SearchState>(initial);
  const [applied, setApplied] = useState<SearchState | null>(initial.q.trim() ? initial : null);
  const [showFilters, setShowFilters] = useState(activeFilterCount(initial) > 0);
  const [preview, setPreview] = useState<Paper | null>(null);
  const closePreview = useCallback(() => setPreview(null), []);
  const draftRef = useRef(draft);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const appliedQuery = applied ? stateToParams(applied).toString() : null;
  const buildUrl = useMemo(
    () => (applied ? (page: number) => listUrl('search', stateToParams(applied, { page })) : null),
    [appliedQuery], // rebuild only when the search really changes
  );
  const list = usePaperList(buildUrl);

  // keep the address bar in step with the applied search (back, reload, share)
  useEffect(() => {
    const url = appliedQuery ? `/papers?${appliedQuery}` : '/papers';
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(window.history.state, '', url);
  }, [appliedQuery]);

  useEffect(() => () => void (debounce.current && clearTimeout(debounce.current)), []);

  const run = useCallback((s: SearchState) => {
    if (debounce.current) clearTimeout(debounce.current);
    const q = s.q.trim();
    setApplied(q ? { ...s, q } : null);
  }, []);

  const setForm = (next: SearchState) => {
    draftRef.current = next;
    setDraft(next);
  };

  /* Update the form, and re-run a search already made (typed numbers wait a moment). */
  const patch = (p: Partial<SearchState>, { typed = false } = {}) => {
    const next = { ...draftRef.current, ...p };
    setForm(next);
    if (!applied) return;
    if (debounce.current) clearTimeout(debounce.current);
    const rerun = () => run({ ...draftRef.current, q: applied.q });
    if (typed) debounce.current = setTimeout(rerun, 700);
    else rerun();
  };

  const active = activeFilterCount(draft);

  return (
    <div className="fp">
      <div className="fp-form">
        <SearchBox
          value={draft.q}
          onChange={(q) => setForm({ ...draftRef.current, q })}
          onSubmit={() => run(draftRef.current)}
          maxChars={maxQueryChars}
          busy={list.status === 'loading'}
        />
        <div className="fp-form-row">
          <ModeSwitch value={draft.mode} onChange={(mode) => patch({ mode })} />
          <button
            type="button"
            className="btn btn-ghost btn-sm fp-filter-btn"
            aria-expanded={showFilters}
            aria-controls="fp-filters"
            onClick={() => setShowFilters((v) => !v)}
          >
            <Icon name="sliders" /> Filters
            {active > 0 && <b className="fp-filter-count">{active}</b>}
          </button>
        </div>
        {showFilters && (
          <FilterPanel
            state={draft}
            active={active}
            onChange={(p) => patch(p, { typed: 'from' in p || 'to' in p || 'minCites' in p })}
            onClear={() => patch(clearFilters(draftRef.current))}
          />
        )}
      </div>

      {!applied ? (
        <SearchIntro />
      ) : (
        <PaperResults
          list={list}
          maxQueryChars={maxQueryChars}
          onOpen={setPreview}
          activeId={preview?.id}
          toolbar={<SortSelect value={draft.sort} onChange={(sort) => patch({ sort })} />}
          empty={
            <NoResults
              filtered={activeFilterCount(applied) > 0}
              mode={applied.mode}
              onClear={() => patch(clearFilters(draftRef.current))}
              onSmart={() => patch({ mode: 'smart' })}
            />
          }
        />
      )}

      {preview && <PaperPreview paper={preview} filters={applied ?? draft} maxQueryChars={maxQueryChars} onClose={closePreview} />}
    </div>
  );
}

function SearchIntro() {
  return (
    <div className="lib-empty fp-intro">
      <Icon name="book" />
      <h2 className="h3">Search 300 million research papers</h2>
      <p>Type a few keywords, ask a question, or paste a paragraph such as your project aim. Smart mode matches both your words and their meaning.</p>
    </div>
  );
}

function NoResults({ filtered, mode, onClear, onSmart }: { filtered: boolean; mode: SearchState['mode']; onClear: () => void; onSmart: () => void }) {
  return (
    <div className="lib-empty fp-empty">
      <Icon name="search" />
      <h2 className="h3">No papers found</h2>
      <p>
        {filtered ? 'Try removing some filters' : 'Try different words'}
        {mode !== 'smart' ? ', or switch to Smart mode.' : '.'}
      </p>
      <div className="fp-empty-actions">
        {filtered && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>
            Clear filters
          </button>
        )}
        {mode !== 'smart' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onSmart}>
            Use Smart mode
          </button>
        )}
      </div>
    </div>
  );
}
