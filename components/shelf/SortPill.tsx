'use client';

import type { ListSort } from '@/lib/shelf/store/list-query';
import { Icon } from '../Icon';
import { Select } from '../Select';
import { SORT_LABELS } from './shelf-state';

/* "⇅ Recently added": the sort order as a pill. Best match only while searching. */
export function SortPill({ value, searching, onChange }: { value: ListSort; searching: boolean; onChange: (s: ListSort) => void }) {
  return (
    <span className="sh-sort-pill">
      <Icon name="sort" />
      <Select<ListSort>
        className="sh-sort-select"
        value={value}
        onChange={onChange}
        aria-label="Sort"
        options={(Object.entries(SORT_LABELS) as [ListSort, string][]).filter(([k]) => k !== 'relevance' || searching).map(([k, v]) => ({ value: k, label: v }))}
      />
    </span>
  );
}
