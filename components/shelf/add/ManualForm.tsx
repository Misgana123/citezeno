'use client';

import { useState } from 'react';
import type { ManualPaperInput } from '@/lib/shelf/api/manual-schema';
import { draftToInput, type ManualDraft } from './manual-draft';

export { draftToInput, emptyDraft, type ManualDraft } from './manual-draft';

/* Title, authors, year, source, link (and DOI) typed by hand. Used to add a
   paper nothing was found for, and to correct a manual or imported paper. */

export function ManualForm({ initial, submitLabel, onSubmit, onCancel }: { initial: ManualDraft; submitLabel: string; onSubmit: (input: ManualPaperInput) => Promise<string | null>; onCancel?: () => void }) {
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof ManualDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD({ ...d, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!d.title.trim()) return setError('Give the paper a title.');
    if (d.year.trim() && !/^\d{4}$/.test(d.year.trim())) return setError('Check the year.');
    setBusy(true);
    setError(await onSubmit(draftToInput(d)));
    setBusy(false);
  };

  return (
    <form className="sh-manual" onSubmit={submit}>
      <label className="field">
        Title
        <input className="input" value={d.title} onChange={set('title')} maxLength={1000} required />
      </label>
      <label className="field">
        Authors <span className="fp-field-note">one per line</span>
        <textarea className="input" rows={3} value={d.authors} onChange={set('authors')} placeholder={'Ada Lovelace\nAlan Turing'} />
      </label>
      <div className="sh-manual-row">
        <label className="field">
          Year
          <input className="input" value={d.year} onChange={set('year')} inputMode="numeric" maxLength={4} placeholder="2024" />
        </label>
        <label className="field">
          Journal, publisher or website
          <input className="input" value={d.source} onChange={set('source')} maxLength={500} />
        </label>
      </div>
      <label className="field">
        Link
        <input className="input" type="url" value={d.url} onChange={set('url')} maxLength={2000} placeholder="https://" />
      </label>
      <label className="field">
        DOI <span className="fp-field-note">optional</span>
        <input className="input" value={d.doi} onChange={set('doi')} maxLength={300} placeholder="10.1234/abcd" />
      </label>
      {error && (
        <p className="sh-form-err" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        {onCancel && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn-thread btn-sm" disabled={busy}>
          {busy && <span className="spin" aria-hidden="true" />} {submitLabel}
        </button>
      </div>
    </form>
  );
}
