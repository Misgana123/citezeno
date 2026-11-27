'use client';

import type { SearchMode } from '@/lib/papers/search/options';

export const MODES: { id: SearchMode; label: string; hint: string }[] = [
  { id: 'smart', label: 'Smart', hint: 'Keywords and meaning together. Best for most searches.' },
  { id: 'keyword', label: 'Exact keywords', hint: 'Matches your words. Best for a drug, gene or method name. Supports "phrases", AND, OR, NOT.' },
  { id: 'semantic', label: 'By meaning', hint: 'Finds papers about the same idea, in any wording or language. Best for long descriptions.' },
];

/* Smart / Exact keywords / By meaning, with a line on what the chosen one does. */
export function ModeSwitch({ value, onChange, compact = false }: { value: SearchMode; onChange: (m: SearchMode) => void; compact?: boolean }) {
  const hint = MODES.find((m) => m.id === value)?.hint;
  const seg = (
    <div className="seg" role="group" aria-label="Search mode">
      {MODES.map((m) => (
        <button key={m.id} type="button" aria-pressed={value === m.id} onClick={() => onChange(m.id)} title={compact ? m.hint : undefined}>
          {m.label}
        </button>
      ))}
    </div>
  );
  // compact: just the switch (each mode's hint shows on hover)
  if (compact) return seg;
  return (
    <div className="fp-modes">
      <div className="seg" role="group" aria-label="Search mode">
        {MODES.map((m) => (
          <button key={m.id} type="button" aria-pressed={value === m.id} onClick={() => onChange(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="fp-mode-hint">{hint}</p>
    </div>
  );
}
