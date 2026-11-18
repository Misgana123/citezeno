'use client';

import type { SortKey } from '@/lib/papers/search/options';

const SORT_LABELS: Record<SortKey, string> = { relevance: 'Most relevant', newest: 'Newest first', cited: 'Most cited' };

export function SortSelect({ value, onChange, relevanceLabel }: { value: SortKey; onChange: (s: SortKey) => void; relevanceLabel?: string }) {
  return (
    <label className="fp-sort">
      <span>Sort</span>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value as SortKey)}>
        {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
          <option key={k} value={k}>
            {k === 'relevance' && relevanceLabel ? relevanceLabel : SORT_LABELS[k]}
          </option>
        ))}
      </select>
    </label>
  );
}
