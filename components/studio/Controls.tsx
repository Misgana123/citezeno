'use client';

import { PROVIDERS, PROVIDER_KEYS } from '@/lib/sources';
import { STYLES } from '@/lib/styles';
import { isEligible } from '@/lib/text';
import type { Analysis, Kind, Mode, Prefs } from '@/lib/types';
import { Icon } from '../Icon';
import { PROVIDER_COLOR } from './SourceCards';

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

/* Right panel of the studio: everything that shapes a trace. */
export function Controls({
  prefs,
  set,
  analysis,
  cost,
  onSettings,
  onClose,
}: {
  prefs: Prefs;
  set: (p: Partial<Prefs>) => void;
  analysis: Analysis | null;
  /* credits a full trace of the current draft would use */
  cost: number;
  onSettings: () => void;
  onClose: () => void;
}) {
  const st = STYLES[prefs.style];
  const citable = analysis ? analysis.sentences.filter(isEligible).length : 0;
  const eligible = analysis ? Math.max(1, citable) : 0;
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
    <aside className="at-insp" aria-label="Trace settings">
      <div className="at-panel-head">
        <h2 className="at-panel-title">
          <Icon name="sliders" /> Trace settings
        </h2>
        <button className="at-x" onClick={onClose} aria-label="Close the panel">
          <Icon name="x" />
        </button>
      </div>

      <div className="at-panel-body">
        <section className="at-sec">
          <h3 className="at-h">Draft</h3>
          <div className="at-tiles">
            <div>
              <b>{(analysis ? analysis.wordCount : 0).toLocaleString()}</b>
              <span>words</span>
            </div>
            <div>
              <b>{analysis ? analysis.sentences.length : 0}</b>
              <span>sentences</span>
            </div>
            <div className="hot">
              <b>{citable}</b>
              <span>citable</span>
            </div>
          </div>
          <p className="at-cost">
            <Icon name="bolt" />
            {cost > 0 ? (
              <span>
                A full trace uses <b>{cost}</b> credit{cost === 1 ? '' : 's'}, one per claim.
              </span>
            ) : (
              <span>Tracing costs one credit per claim.</span>
            )}
          </p>
        </section>

        <section className="at-sec">
          <div className="at-row">
            <h3 className="at-h">Sources to find</h3>
            <div className="at-stepper">
              <button onClick={() => setCount(prefs.count - 1)} aria-label="Fewer sources" disabled={prefs.count <= 1}>
                <Icon name="minus" />
              </button>
              <output aria-live="polite">{prefs.count}</output>
              <button onClick={() => setCount(prefs.count + 1)} aria-label="More sources" disabled={prefs.count >= 40}>
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
          <p className="at-hint">{countHint}</p>
        </section>

        <section className="at-sec">
          <h3 className="at-h">Output</h3>
          <div className="at-opts" role="radiogroup" aria-label="Output form">
            {MODES.map((m) => {
              const disabled = m.id === 'intext' && st.family === 'notes';
              return (
                <button key={m.id} role="radio" aria-checked={prefs.mode === m.id} className="at-opt" disabled={disabled} title={disabled ? `${st.name} cites with notes` : m.hint} onClick={() => set({ mode: m.id })}>
                  <span className="at-opt-glyph serif">{m.glyph(st)}</span>
                  <span className="at-opt-txt">
                    <b>{m.label}</b>
                    <small>{disabled ? `${st.name} cites with notes` : m.hint}</small>
                  </span>
                  <span className="at-opt-dot" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </section>

        <section className="at-sec">
          <div className="at-row">
            <h3 className="at-h">Databases</h3>
            <span className="at-hint">{on} of 4 on</span>
          </div>
          <div className="at-dbs">
            {PROVIDER_KEYS.map((k) => (
              <label key={k} className="at-db">
                <i className="at-db-dot" style={{ background: PROVIDER_COLOR[PROVIDERS[k].name] }} aria-hidden="true" />
                <span className="at-db-txt">
                  <b>{PROVIDERS[k].name}</b>
                  <small>{PROVIDERS[k].blurb}</small>
                </span>
                <input type="checkbox" checked={prefs.providers[k]} onChange={(e) => set({ providers: { ...prefs.providers, [k]: e.target.checked } })} />
                <span className="at-switch" aria-hidden="true" />
              </label>
            ))}
          </div>
          <button className="at-link-btn" onClick={onSettings}>
            <Icon name="gear" /> Database settings
            <Icon name="chevron" className="at-link-chev" />
          </button>
        </section>

        <details className="at-sec at-refine">
          <summary>
            <h3 className="at-h">Filters</h3>
            <span className="at-hint">{refineSummary}</span>
            <Icon name="chevron" className="at-refine-chev" />
          </summary>
          <div className="at-refine-grid">
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
              <span className="at-row" style={{ margin: 0 }}>
                <span>Match strictness</span>
                <span className="at-hint">{Math.round(prefs.minRel * 100)}% minimum</span>
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

        <p className="at-note">
          <Icon name="shield" /> Searches run in your browser. If you’re signed in, your drafts and results are saved to your account so you can find them later.
        </p>
        <div className="at-callout">
          <b>Check before you cite</b>
          Citezeno matches sources by topic. Open each one and confirm it supports your sentence.
        </div>
      </div>
    </aside>
  );
}
