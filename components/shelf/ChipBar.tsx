'use client';

import type { ReactNode } from 'react';
import type { ShelfFilters } from './shelf-state';

/* The quick filters under the heading, different for each collection, with
   the view's tools (sort, storage…) on the right. */

type Chip = { label: string; on: boolean; set: Partial<ShelfFilters> };

const SINCE = '2020';

export function chipsFor(f: ShelfFilters): Chip[] {
  if (f.collection === 'uploads')
    return [
      { label: 'Your documents', on: f.matched === 'no', set: { matched: f.matched === 'no' ? '' : 'no' } },
      { label: 'Matched to a paper', on: f.matched === 'yes', set: { matched: f.matched === 'yes' ? '' : 'yes' } },
      { label: 'In progress', on: f.wip, set: { wip: !f.wip } },
    ];
  return [
    { label: 'Open access', on: f.oa, set: { oa: !f.oa } },
    { label: 'Has your PDF', on: f.pdf, set: { pdf: !f.pdf } },
    { label: `Since ${SINCE}`, on: f.from === SINCE && !f.to, set: f.from === SINCE && !f.to ? { from: '' } : { from: SINCE, to: '' } },
    { label: 'Retracted', on: f.retracted, set: { retracted: !f.retracted } },
  ];
}

/* Every quick and extra filter off: "All" (or "All files") is lit. */
export const CLEAR_ALL: Partial<ShelfFilters> = { oa: false, pdf: false, from: '', to: '', retracted: false, matched: '', wip: false, status: '' };
const noneOn = (f: ShelfFilters) => !f.oa && !f.pdf && !f.from && !f.to && !f.retracted && !f.matched && !f.wip && !f.status;

export function ChipBar({ filters, onChange, children }: { filters: ShelfFilters; onChange: (p: Partial<ShelfFilters>) => void; children?: ReactNode }) {
  return (
    <div className="sh-chipbar">
      <div className="sh-chips" role="group" aria-label="Quick filters">
        <button type="button" aria-pressed={noneOn(filters)} onClick={() => onChange(CLEAR_ALL)}>
          {filters.collection === 'uploads' ? 'All files' : 'All'}
        </button>
        {chipsFor(filters).map((c) => (
          <button key={c.label} type="button" aria-pressed={c.on} onClick={() => onChange(c.set)}>
            {c.label}
          </button>
        ))}
      </div>
      {children && <div className="sh-chipbar-tools">{children}</div>}
    </div>
  );
}
