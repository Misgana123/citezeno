'use client';

import { useCallback, useRef, useState } from 'react';
import { READING_STATUSES } from '@/lib/shelf/types';
import { Icon } from '../Icon';
import { STATUS_LABELS, type ShelfFilters } from './shelf-state';
import { useDismiss } from './useDismiss';

/* The filters the chips don't cover: reading status and a year range. */
export function FilterMenu({ filters, onChange }: { filters: ShelfFilters; onChange: (p: Partial<ShelfFilters>) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(box, open, close);
  const n = [filters.status, filters.from || filters.to].filter(Boolean).length;
  return (
    <div className="sh-tool" ref={box}>
      <button type="button" className={`sh-tool-btn${n ? ' is-on' : ''}`} onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open} aria-label="More filters" title="More filters">
        <Icon name="filter" />
        {n > 0 && <b className="sh-tool-n">{n}</b>}
      </button>
      {open && (
        <div className="umenu-pop sh-filter-pop" role="dialog" aria-label="More filters">
          <span className="sh-pop-h">Reading status</span>
          <div className="sh-pop-seg">
            <button type="button" aria-pressed={!filters.status} onClick={() => onChange({ status: '' })}>
              Any
            </button>
            {READING_STATUSES.map((s) => (
              <button key={s} type="button" aria-pressed={filters.status === s} onClick={() => onChange({ status: s })}>
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          <span className="sh-pop-h">Year</span>
          <div className="sh-pop-years">
            <input className="input" inputMode="numeric" maxLength={4} placeholder="From" value={filters.from} onChange={(e) => onChange({ from: e.target.value.replace(/\D/g, '') })} aria-label="From year" />
            <span>–</span>
            <input className="input" inputMode="numeric" maxLength={4} placeholder="To" value={filters.to} onChange={(e) => onChange({ to: e.target.value.replace(/\D/g, '') })} aria-label="To year" />
          </div>
          {n > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ status: '', from: '', to: '' })}>
              Clear these filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
