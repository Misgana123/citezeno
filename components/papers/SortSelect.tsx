'use client';

import type { SortKey } from '@/lib/papers/search/options';
import { Select } from '../Select';

const SORT_LABELS: Record<SortKey, string> = { relevance: 'Most relevant', newest: 'Newest first', cited: 'Most cited' };

export function SortSelect({ value, onChange, relevanceLabel }: { value: SortKey; onChange: (s: SortKey) => void; relevanceLabel?: string }) {
  return (
    <label className="fp-sort">
      <span>Sort</span>
      <Select<SortKey>
        value={value}
        onChange={onChange}
        options={(Object.keys(SORT_LABELS) as SortKey[]).map((k) => ({ value: k, label: k === 'relevance' && relevanceLabel ? relevanceLabel : SORT_LABELS[k] }))}
      />
    </label>
  );
}
