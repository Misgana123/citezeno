'use client';

import { PROVIDERS, PROVIDER_KEYS } from '@/lib/sources';
import { STYLES } from '@/lib/styles';
import { isEligible } from '@/lib/text';
import type { Analysis, Kind, Mode, Prefs } from '@/lib/types';
import { Icon } from '../Icon';

export const MODES: { id: Mode; label: string; hint: string; glyph: (st: (typeof STYLES)[string]) => string }[] = [
  {
    id: 'intext',
    label: 'In-text citations',
    hint: 'Citations inside sentences, with a reference list',
    glyph: (st) =>
      st.family === 'numeric' ? (st.marker === 'bracket' ? '[1]' : st.marker === 'sup' ? 'x¹' : '(1)') : st.family === 'notes' ? '—' : st.name === 'MLA' ? '(Ali)' : '(Ali, 20)',
  },
  { id: 'footnotes', label: 'Footnotes', hint: 'Numbered notes under each paragraph', glyph: () => 'x¹' },
  { id: 'endnotes', label: 'Endnotes', hint: 'Numbered notes collected at the end', glyph: () => '¹…' },
  { id: 'list', label: 'Bibliography only', hint: 'Just the reference list', glyph: () => '≡' },
  { id: 'annotated', label: 'Annotated bibliography', hint: 'References with editable summaries', glyph: () => '≡✎' },
];

export function Controls({ prefs, set, analysis }: { prefs: Prefs; set: (p: Partial<Prefs>) => void; analysis: Analysis | null }) {
  const st = STYLES[prefs.style];
  const eligible = analysis ? Math.max(1, analysis.sentences.filter(isEligible).length) : 0;
  const countHint = !eligible
    ? 'Spread across your strongest claims.'
    : prefs.count <= eligible
      ? `One each for your ${prefs.count} strongest claim${prefs.count > 1 ? 's' : ''}.`
      : `About ${(prefs.count / eligible).toFixed(1).replace('.0', '')} per claim across ${eligible} claims.`;
  const setCount = (n: number) => set({ count: Math.max(1, Math.min(40, Math.round(n))) });
  const on = PROVIDER_KEYS.filter((k) => prefs.providers[k]).length;
  const refineSummary = [
    prefs.yearFrom || prefs.yearTo ? `${prefs.yearFrom || 'any'}–${prefs.yearTo || 'now'}` : 'Any year',
    { any: 'all types', scholarly: 'scholarly', books: 'books' }[prefs.kind],
    prefs.oaOnly ? 'open access' : '',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <aside className="insp" aria-label="Citation settings">
      <section className="insp-sec">
        <div className="insp-row">
          <h3 className="insp-h">Sources to find</h3>
          <div className="stepper">
            <button onClick={() => setCount(prefs.count - 1)} aria-label="Fewer sources">
              <Icon name="minus" />
            </button>
            <output aria-live="polite">{prefs.count}</output>
            <button onClick={() => setCount(prefs.count + 1)} aria-label="More sources">
              <Icon name="plus" />
            </button>
          </div>
        </div>
        <input
          type="range"
          min={1}
          max={40}
          value={prefs.count}
          onChange={(e) => setCount(+e.target.value)}
          aria-label="Number of sources"
          style={{ ['--p' as string]: `${((prefs.count - 1) / 39) * 100}%` } as React.CSSProperties}
        />
        <p className="insp-hint">{countHint}</p>
      </section>

      <section className="insp-sec">
        <h3 className="insp-h">Output</h3>
        <div className="opts" role="radiogroup" aria-label="Output form">
          {MODES.map((m) => {
            const disabled = m.id === 'intext' && st.family === 'notes';
            return (
              <button
                key={m.id}
                role="radio"
                aria-checked={prefs.mode === m.id}
                className="opt"
                disabled={disabled}
                title={disabled ? `${st.name} cites with notes` : m.hint}
                onClick={() => set({ mode: m.id })}
              >
                <span className="opt-glyph serif">{m.glyph(st)}</span>
                <span className="opt-label">{m.label}</span>
                <span className="opt-mini serif">{m.glyph(st)}</span>
                <span className="opt-dot" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </section>

      <section className="insp-sec">
        <div className="insp-row">
          <h3 className="insp-h">Databases</h3>
          <span className="insp-hint">{on} of 4 on</span>
        </div>
        <div className="dbs">
          {PROVIDER_KEYS.map((k) => (
            <label key={k} className="db">
              <span>
                <b>{PROVIDERS[k].name}</b>
                <small>{PROVIDERS[k].blurb}</small>
              </span>
              <input
                type="checkbox"
                checked={prefs.providers[k]}
                onChange={(e) => set({ providers: { ...prefs.providers, [k]: e.target.checked } })}
              />
              <span className="sw" aria-hidden="true" />
            </label>
          ))}
        </div>
      </section>

      <details className="insp-sec refine">
        <summary>
          <h3 className="insp-h">Filters</h3>
          <span className="insp-hint">{refineSummary}</span>
          <Icon name="chevron" className="refine-chev" />
        </summary>
        <div className="refine-grid">
          <label className="field">
            From year
            <input className="input" type="number" inputMode="numeric" placeholder="1990" value={prefs.yearFrom} onChange={(e) => set({ yearFrom: e.target.value.slice(0, 4) })} />
          </label>
          <label className="field">
            To year
            <input className="input" type="number" inputMode="numeric" placeholder="2026" value={prefs.yearTo} onChange={(e) => set({ yearTo: e.target.value.slice(0, 4) })} />
          </label>
          <label className="field span2">
            Source type
            <select className="select" value={prefs.kind} onChange={(e) => set({ kind: e.target.value as Kind })}>
              <option value="any">All types</option>
              <option value="scholarly">Scholarly only</option>
              <option value="books">Books and chapters</option>
            </select>
          </label>
          <label className="field span2">
            <span className="insp-row" style={{ margin: 0 }}>
              <span>Match strictness</span>
              <span className="insp-hint">{Math.round(prefs.minRel * 100)}% minimum</span>
            </span>
            <input
              type="range"
              min={0}
              max={0.5}
              step={0.05}
              value={prefs.minRel}
              onChange={(e) => set({ minRel: +e.target.value })}
              style={{ ['--p' as string]: `${(prefs.minRel / 0.5) * 100}%` } as React.CSSProperties}
            />
          </label>
          <label className="check span2">
            <input type="checkbox" checked={prefs.oaOnly} onChange={(e) => set({ oaOnly: e.target.checked })} />
            Open-access works only
          </label>
        </div>
      </details>

      <p className="insp-foot">
        <Icon name="shield" /> Searches go straight from your browser to the public databases. Nothing is stored on a server.
      </p>
    </aside>
  );
}
