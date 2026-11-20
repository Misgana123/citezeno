'use client';

import { WORK_TYPES, type WorkType } from '@/lib/papers/search/options';
import { LANGUAGES, languageName, TYPE_LABELS } from './format';
import type { SearchState } from './state';
import { Select } from '../Select';

type Patch = (p: Partial<SearchState>) => void;

const thisYear = new Date().getFullYear();

/* Year range, open access, type, language, abstract, retracted, minimum citations. */
export function FilterPanel({ state, onChange, onClear, active }: { state: SearchState; onChange: Patch; onClear: () => void; active: number }) {
  const citesNote =
    state.mode === 'keyword' ? null : state.mode === 'smart' ? 'Applied to the top matches only.' : 'Applied to the 50 closest papers only.';

  return (
    <div className="fp-filters at-card" id="fp-filters">
      <div className="fp-filter-grid">
        <fieldset className="fp-years">
          <legend className="field">Published</legend>
          <div>
            <input
              className="input"
              inputMode="numeric"
              pattern="\d{4}"
              placeholder="From"
              aria-label="From year"
              value={state.from}
              maxLength={4}
              onChange={(e) => onChange({ from: e.target.value.replace(/\D/g, '') })}
            />
            <span aria-hidden="true">–</span>
            <input
              className="input"
              inputMode="numeric"
              pattern="\d{4}"
              placeholder={String(thisYear)}
              aria-label="To year"
              value={state.to}
              maxLength={4}
              onChange={(e) => onChange({ to: e.target.value.replace(/\D/g, '') })}
            />
          </div>
        </fieldset>

        <label className="field">
          Type
          <Select<WorkType | ''>
            value={state.type}
            onChange={(type) => onChange({ type })}
            options={[{ value: '', label: 'Any type' }, ...WORK_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }))]}
          />
        </label>

        <label className="field">
          Language
          <Select
            value={state.lang}
            onChange={(lang) => onChange({ lang })}
            options={[{ value: '', label: 'Any language' }, ...LANGUAGES.map((l) => ({ value: l, label: languageName(l) ?? l }))]}
          />
        </label>

        <label className="field">
          Cited at least
          <input
            className="input"
            inputMode="numeric"
            placeholder="Any"
            value={state.minCites}
            maxLength={7}
            onChange={(e) => onChange({ minCites: e.target.value.replace(/\D/g, '') })}
            aria-describedby={citesNote ? 'fp-cites-note' : undefined}
          />
          {citesNote && (
            <small className="fp-field-note" id="fp-cites-note">
              {citesNote}
            </small>
          )}
        </label>
      </div>

      <div className="fp-filter-checks">
        <label className="check">
          <input type="checkbox" checked={state.oa} onChange={(e) => onChange({ oa: e.target.checked })} /> Open access only
        </label>
        <label className="check">
          <input type="checkbox" checked={state.abstract} onChange={(e) => onChange({ abstract: e.target.checked })} /> Has an abstract
        </label>
        <label className="check">
          <input type="checkbox" checked={!state.retracted} onChange={(e) => onChange({ retracted: !e.target.checked })} /> Hide retracted papers
        </label>
        {active > 0 && (
          <button type="button" className="btn btn-ghost btn-sm fp-clear" onClick={onClear}>
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
