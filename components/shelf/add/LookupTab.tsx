'use client';

import { useState } from 'react';
import type { Paper } from '@/lib/papers/types';
import type { ShelfItem } from '@/lib/shelf/types';
import { Icon } from '../../Icon';
import { authorsShort } from '../../papers/format';
import { ShelfApiError, shelfFetch, shelfItemHref } from '../api';
import { savedToast } from '../dup-hint';
import { markSaved } from '../saved-store';
import type { DupSummary } from '@/lib/shelf/api/saved-response';
import type { ManualDraft } from './ManualForm';

type Lookup = { via: 'doi' | 'link' | 'title'; papers: Paper[]; saved: Record<string, string> };

/* Paste a DOI, a link or a title; pick the right paper; add it. When nothing
   is found the user can switch to entering the details by hand. */
export function LookupTab({ projectId, onAdded, onManual }: { projectId: string | null; onAdded: (item: ShelfItem) => void; onManual: (draft: Partial<ManualDraft>) => void }) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Lookup | null>(null);
  const [error, setError] = useState<ShelfApiError | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  const find = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await shelfFetch<Lookup>('/api/shelf/lookup', { method: 'POST', body: { input } }));
    } catch (err) {
      setError(err as ShelfApiError);
    } finally {
      setBusy(false);
    }
  };

  const add = async (p: Paper) => {
    if (!result) return;
    setAdding(p.id);
    try {
      const r = await shelfFetch<{ item: ShelfItem; possibleDuplicates: DupSummary[] }>('/api/shelf/papers', { method: 'POST', body: { via: result.via, paperId: p.id, projectId } });
      savedToast('Added to your shelf', r.possibleDuplicates);
      markSaved(p.id, r.item.id);
      setResult({ ...result, saved: { ...result.saved, [p.id]: r.item.id } });
      onAdded(r.item);
    } catch (err) {
      const e = err as ShelfApiError;
      if (e.code === 'duplicate' && e.itemId) setResult({ ...result, saved: { ...result.saved, [p.id]: e.itemId } });
      else setError(e);
    } finally {
      setAdding(null);
    }
  };

  const looksLikeDoi = /^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)?10\.\d{4,9}\//i.test(input.trim());
  const manualDraft = (): Partial<ManualDraft> => (looksLikeDoi ? { doi: input.trim() } : /^https?:\/\//i.test(input.trim()) ? { url: input.trim() } : { title: input.trim() });

  return (
    <div className="sh-lookup">
      <form className="sh-lookup-form" onSubmit={find}>
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="10.7717/peerj.4375, a link, or a title"
          aria-label="DOI, link or title"
          maxLength={2000}
          autoFocus
        />
        <button type="submit" className="btn btn-thread btn-sm" disabled={busy || !input.trim()}>
          {busy ? <span className="spin" aria-hidden="true" /> : <Icon name="search" />} Find
        </button>
      </form>
      <p className="sh-hint">DOIs and links to doi.org, OpenAlex, arXiv, PubMed and most publisher pages are found instantly. A title search counts toward your daily search limit.</p>

      {error && (
        <div className="fp-error" role="alert">
          <Icon name="alert" />
          <p>{error.message}</p>
          {(error.code === 'not_found' || error.code === 'bad_request') && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onManual(manualDraft())}>
              Enter by hand
            </button>
          )}
        </div>
      )}

      {result && (
        <div className="sh-matches">
          {result.via === 'title' && <p className="fp-count">{result.papers.length ? 'Closest matches' : 'No matches'}</p>}
          {!result.papers.length && (
            <div className="fp-error">
              <Icon name="help" />
              <p>No paper with a title like this was found.</p>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onManual({ title: input.trim() })}>
                Enter by hand
              </button>
            </div>
          )}
          <ul className="sh-match-list">
            {result.papers.map((p) => {
              const saved = result.saved[p.id];
              return (
                <li key={p.id} className="sh-match">
                  <div>
                    <b className="sh-match-title">{p.title}</b>
                    <span className="sh-match-meta">{[authorsShort(p.authors, 2), p.year, p.source].filter(Boolean).join(' · ')}</span>
                  </div>
                  {saved ? (
                    <a className="btn btn-ghost btn-sm sv-saved" href={shelfItemHref(saved)} title="Already on your shelf: open it">
                      <Icon name="check" /> On your shelf
                    </a>
                  ) : (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => add(p)} disabled={!!adding}>
                      {adding === p.id ? <span className="spin" aria-hidden="true" /> : <Icon name="plus" />} Add
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {result.via === 'title' && result.papers.length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm sh-not-here" onClick={() => onManual({ title: input.trim() })}>
              Not here? Enter the details by hand
            </button>
          )}
        </div>
      )}
    </div>
  );
}
