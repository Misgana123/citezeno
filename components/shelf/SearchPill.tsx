'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import type { ShelfFilters } from './shelf-state';

/* The header's search: details, tags, notes and PDF text. Typing searches
   after a short pause; "/" anywhere on the page jumps here. */
export function SearchPill({ filters, placeholder, onChange }: { filters: ShelfFilters; placeholder: string; onChange: (p: Partial<ShelfFilters>) => void }) {
  const [q, setQ] = useState(filters.q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // the URL or a view change can reset the search
  useEffect(() => setQ(filters.q), [filters.q]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  return (
    <form
      className="sh-pill-search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        search(q, true);
      }}
    >
      <Icon name="search" />
      <input ref={input} value={q} onChange={(e) => search(e.target.value)} placeholder={placeholder} aria-label={placeholder} maxLength={500} />
      {q ? (
        <button type="button" className="sh-pill-x" onClick={() => search('', true)} aria-label="Clear the search">
          <Icon name="x" />
        </button>
      ) : (
        <kbd aria-hidden="true">/</kbd>
      )}
    </form>
  );
}
