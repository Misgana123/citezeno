'use client';

import type { ExploreFacets } from '@/lib/papers/explore/types';
import { SUBJECTS, subjectColor, subjectLabel } from '@/lib/papers/subjects';
import { compactCount } from './format';

/* The subject chips above the gallery: All, then the subjects with the most
   papers (up to 10, with their counts), and the chosen one even if it isn't
   among them. Without counts (the live listing), the main subjects. */
export const TOP_CHIPS = 10;

export function SubjectChips({ value, facets, onChange }: { value: string; facets: ExploreFacets | null; onChange: (subject: string) => void }) {
  const counted = facets?.subjects.filter((s) => s.count > 0).slice(0, TOP_CHIPS);
  const chips = counted ?? SUBJECTS.slice(0, 9).map((s) => ({ value: s.name, count: -1 }));
  if (value && !chips.some((c) => c.value === value)) chips.push({ value, count: facets?.subjects.find((s) => s.value === value)?.count ?? -1 });
  return (
    <div className="ex-chips" role="group" aria-label="Subject">
      <button type="button" className="ex-chip" aria-pressed={!value} onClick={() => onChange('')}>
        All
      </button>
      {chips.map((c) => (
        <button key={c.value} type="button" className="ex-chip" aria-pressed={value === c.value} onClick={() => onChange(value === c.value ? '' : c.value)}>
          <span className="ex-dot" style={{ background: subjectColor(c.value) }} />
          {subjectLabel(c.value)}
          {c.count >= 0 && <small>{compactCount(c.count)}</small>}
        </button>
      ))}
    </div>
  );
}
