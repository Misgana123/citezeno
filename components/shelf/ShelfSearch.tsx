'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { activeFilterCount, type ShelfFilters } from './shelf-state';

/* Search the shelf (details, tags, notes and PDF text) and filter it by year,
   open access, retraction and PDF. Typing searches after a short pause. */
export function ShelfSearch({ filters, onChange }: { filters: ShelfFilters; onChange: (p: Partial<ShelfFilters>) => void }) {
  const [q, setQ] = useState(filters.q);
  const [open, setOpen] = useState(activeFilterCount(filters) - (filters.status ? 1 : 0) > 0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // the URL or a view change can reset the search
  useEffect(() => setQ(filters.q), [filters.q]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const search = (value: string, now = false) => {
    setQ(value);
    if (timer.current) clearTimeout(timer.current);
    const apply = () => {
      const has = value.trim().length > 0;
      onChange({ q: value, ...(has && filters.sort === 'added_desc' ? { sort: 'relevance' } : !has && filters.sort === 'relevance' ? { sort: 'added_desc' } : {}) });
    };
    if (now) apply();
    else timer.current = setTimeout(apply, 400);
  };

  const extra = [filters.from, filters.to, filters.oa, filters.retracted, filters.pdf].filter(Boolean).length;

  return (
    <div className="sh-search-wrap">
      <div className="sh-search-row">
        <form
          className="sh-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            search(q, true);
          }}
        >
          <Icon name="search" />
          <input value={q} onChange={(e) => search(e.target.value)} placeholder="Search titles, authors, notes, tags and PDF text" aria-label="Search your shelf" maxLength={500} />
          {q && (
            <button type="button" className="icon-btn" onClick={() => search('', true)} aria-label="Clear the search">
              <Icon name="x" />
            </button>
          )}
        </form>
        <button type="button" className="btn btn-ghost btn-sm fp-filter-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Icon name="sliders" /> Filters
          {extra > 0 && <b className="fp-filter-count">{extra}</b>}
        </button>
      </div>
      {open && (
        <div className="sh-filters">
          <fieldset className="fp-years">
            <legend className="fp-field-note">Year</legend>
            <div>
              <input className="input" inputMode="numeric" maxLength={4} placeholder="From" value={filters.from} onChange={(e) => onChange({ from: e.target.value.replace(/\D/g, '') })} aria-label="From year" />
              <span>–</span>
              <input className="input" inputMode="numeric" maxLength={4} placeholder="To" value={filters.to} onChange={(e) => onChange({ to: e.target.value.replace(/\D/g, '') })} aria-label="To year" />
            </div>
          </fieldset>
          <label className="check">
            <input type="checkbox" checked={filters.pdf} onChange={(e) => onChange({ pdf: e.target.checked })} /> Has my PDF
          </label>
          <label className="check">
            <input type="checkbox" checked={filters.oa} onChange={(e) => onChange({ oa: e.target.checked })} /> Open access
          </label>
          <label className="check">
            <input type="checkbox" checked={filters.retracted} onChange={(e) => onChange({ retracted: e.target.checked })} /> Retracted
          </label>
          {extra > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ from: '', to: '', oa: false, retracted: false, pdf: false })}>
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
