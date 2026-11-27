'use client';

import { useEffect, useId, useState } from 'react';
import { CITE_BANDS } from '@/lib/papers/explore/query';
import type { ExploreFacets, FacetCount } from '@/lib/papers/explore/types';
import type { WorkType } from '@/lib/papers/search/options';
import type { ExploreState } from './exploreState';
import { formatCount, LANGUAGES, languageName, sourceLabel, typeLabel } from './format';

/* The Explore filters, shop-style: each choice with how many papers it would
   show (from the feed's counts; none while searching or on the live listing).
   Filters search can't apply (source, free PDF) are hidden while searching. */

const COMMON_TYPES: WorkType[] = ['article', 'review', 'preprint', 'book-chapter', 'dataset', 'other'];
export const YEAR_SPAN = 15;

type Props = { state: ExploreState; facets: ExploreFacets | null; searching: boolean; onChange: (patch: Partial<ExploreState>, opts?: { typed?: boolean }) => void };

export function FacetSidebar({ state, facets, searching, onChange }: Props) {
  const [more, setMore] = useState(!!state.lang);
  const count = (list: FacetCount[] | undefined, value: string) => list?.find((x) => x.value === value)?.count;

  const types = facets ? withChosen(facets.types.map((t) => t.value), state.types).slice(0, 8) : COMMON_TYPES;
  const toggleType = (t: WorkType) => onChange({ types: state.types.includes(t) ? state.types.filter((x) => x !== t) : [...state.types, t] });
  const sources = facets ? withChosen(facets.sources.map((s) => s.value), state.sources) : [];
  const toggleSource = (s: string) => onChange({ sources: state.sources.includes(s) ? state.sources.filter((x) => x !== s) : [...state.sources, s] });

  return (
    <div className="ex-facets">
      <Group title="Type">
        {types.map((t) => (
          <Check key={t} on={state.types.includes(t as WorkType)} label={typeLabel(t) ?? t} count={count(facets?.types, t)} onToggle={() => toggleType(t as WorkType)} />
        ))}
      </Group>

      <Group title="Published">
        <YearRange from={state.from} to={state.to} years={facets?.years ?? null} onChange={(from, to) => onChange({ from, to }, { typed: true })} />
      </Group>

      <Group title="Access">
        <Switch on={state.oa} label="Open access only" count={facets?.access.openAccess} onToggle={() => onChange({ oa: !state.oa })} />
        {!searching && <Switch on={state.pdf} label="Has free PDF" count={facets?.access.hasPdf} onToggle={() => onChange({ pdf: !state.pdf })} />}
        <Switch on={state.abstract} label="Has abstract" count={facets?.access.hasAbstract} onToggle={() => onChange({ abstract: !state.abstract })} />
      </Group>

      {!searching && sources.length > 0 && (
        <Group title="Source">
          {sources.map((s) => (
            <Check key={s} on={state.sources.includes(s)} label={sourceLabel(s)} count={count(facets?.sources, s)} onToggle={() => toggleSource(s)} />
          ))}
        </Group>
      )}

      <Group title="Citations">
        {[...CITE_BANDS].reverse().map((b) => (
          <Check
            key={b}
            on={state.minCites === String(b)}
            label={`${b.toLocaleString('en-US')}+`}
            count={count(facets?.citations, String(b))}
            onToggle={() => onChange({ minCites: state.minCites === String(b) ? '' : (String(b) as ExploreState['minCites']) })}
          />
        ))}
      </Group>

      {more ? (
        <Group title="Language">
          <select className="select ex-select" value={state.lang} onChange={(e) => onChange({ lang: e.target.value })} aria-label="Language">
            <option value="">Any language</option>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {languageName(l)}
              </option>
            ))}
          </select>
        </Group>
      ) : (
        <button type="button" className="ex-more" onClick={() => setMore(true)}>
          Language and more filters
        </button>
      )}
    </div>
  );
}

/* The facet's values, plus any chosen ones it doesn't list (so they can be unticked). */
const withChosen = (values: string[], chosen: string[]) => [...values, ...chosen.filter((c) => !values.includes(c))];

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="ex-group">
      <legend>{title}</legend>
      {children}
    </fieldset>
  );
}

function Check({ on, label, count, onToggle }: { on: boolean; label: string; count?: number; onToggle: () => void }) {
  return (
    <label className={`ex-opt${on ? ' is-on' : ''}${count === 0 && !on ? ' is-empty' : ''}`}>
      <input type="checkbox" checked={on} onChange={onToggle} />
      <span className="ex-box" aria-hidden="true" />
      <span className="ex-opt-label">{label}</span>
      {count != null && <span className="ex-count">{formatCount(count)}</span>}
    </label>
  );
}

function Switch({ on, label, count, onToggle }: { on: boolean; label: string; count?: number; onToggle: () => void }) {
  return (
    <label className="ex-switch">
      <span className="ex-opt-label">
        {label}
        {count != null && <small>{formatCount(count)}</small>}
      </span>
      <input type="checkbox" role="switch" checked={on} onChange={onToggle} />
      <span className="ex-sw" aria-hidden="true" />
    </label>
  );
}

/* The last YEAR_SPAN years as a bar chart, with a two-handle slider under it.
   Both handles at the ends means "any year". Applied when a handle is let go. */
function YearRange({ from, to, years, onChange }: { from: string; to: string; years: FacetCount[] | null; onChange: (from: string, to: string) => void }) {
  const last = new Date().getUTCFullYear();
  const first = last - YEAR_SPAN + 1;
  const clamp = (v: string, d: number) => Math.min(last, Math.max(first, Number(v) || d));
  const [lo, setLo] = useState(clamp(from, first));
  const [hi, setHi] = useState(clamp(to, last));
  const id = useId();
  useEffect(() => {
    setLo(clamp(from, first));
    setHi(clamp(to, last));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const commit = (a: number, b: number) => onChange(a <= first ? '' : String(a), b >= last ? '' : String(b));
  const max = Math.max(1, ...(years ?? []).map((y) => y.count));
  const pct = (y: number) => ((y - first) / (last - first)) * 100;

  return (
    <div className="ex-years">
      {years && (
        <div className="ex-bars" aria-hidden="true">
          {years.map((y) => (
            <i key={y.value} className={Number(y.value) >= lo && Number(y.value) <= hi ? 'in' : ''} style={{ height: `${Math.max(4, (y.count / max) * 100)}%` }} title={`${y.value}: ${formatCount(y.count)}`} />
          ))}
        </div>
      )}
      <div className="ex-range" style={{ '--lo': `${pct(lo)}%`, '--hi': `${pct(hi)}%` } as React.CSSProperties}>
        <input
          type="range"
          min={first}
          max={last}
          value={lo}
          aria-label="From year"
          id={`${id}-from`}
          onChange={(e) => setLo(Math.min(Number(e.target.value), hi))}
          onPointerUp={() => commit(lo, hi)}
          onKeyUp={() => commit(lo, hi)}
        />
        <input
          type="range"
          min={first}
          max={last}
          value={hi}
          aria-label="To year"
          id={`${id}-to`}
          onChange={(e) => setHi(Math.max(Number(e.target.value), lo))}
          onPointerUp={() => commit(lo, hi)}
          onKeyUp={() => commit(lo, hi)}
        />
      </div>
      <div className="ex-year-labels">
        <span>{lo <= first ? `${first} or earlier` : lo}</span>
        <span>{hi}</span>
      </div>
    </div>
  );
}
