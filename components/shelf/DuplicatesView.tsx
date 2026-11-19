'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ShelfItem } from '@/lib/shelf/types';
import { Icon } from '../Icon';
import { authorsShort } from '../papers/format';
import { toast } from '../toast';
import { ShelfApiError, shelfFetch } from './api';

type Pair = { a: ShelfItem; b: ShelfItem; reason: 'same_id' | 'same_doi' | 'similar_title' };

const REASONS: Record<Pair['reason'], string> = {
  same_id: 'Same paper record',
  same_doi: 'Same DOI',
  similar_title: 'Very similar title, same year',
};

/* Pairs that look like the same paper: merge them (the more complete details
   stay, and every project, tag, note and PDF is kept) or keep both. */
export function DuplicatesView({ onChanged }: { onChanged: (removedId?: string) => void }) {
  const [pairs, setPairs] = useState<Pair[] | null>(null);
  const [error, setError] = useState<ShelfApiError | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPairs((await shelfFetch<{ pairs: Pair[] }>('/api/shelf/duplicates')).pairs);
    } catch (e) {
      setError(e as ShelfApiError);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const act = async (pair: Pair, action: 'merge' | 'keep_both') => {
    const key = `${pair.a.id}|${pair.b.id}`;
    setBusy(key);
    try {
      const r = await shelfFetch<{ removedId?: string }>('/api/shelf/duplicates', { method: 'POST', body: { action, a: pair.a.id, b: pair.b.id } });
      toast(action === 'merge' ? 'Merged into one paper' : 'Kept both');
      onChanged(r.removedId);
      // a merge can settle other pairs with the removed paper too
      if (action === 'merge') await load();
      else setPairs((ps) => ps?.filter((p) => p !== pair) ?? null);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(null);
    }
  };

  if (error) {
    return (
      <div className="fp-error" role="alert">
        <Icon name="alert" />
        <p>{error.message}</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={load}>
          Try again
        </button>
      </div>
    );
  }
  if (!pairs) return <div className="hist-loading fp-skel" role="status" aria-label="Looking for duplicates" />;
  if (!pairs.length) {
    return (
      <div className="lib-empty fp-empty">
        <Icon name="check" />
        <h2 className="h3">No possible duplicates</h2>
        <p>Papers that look like the same one show up here, so you can merge them.</p>
      </div>
    );
  }

  return (
    <ul className="sh-dups">
      {pairs.map((pair) => {
        const key = `${pair.a.id}|${pair.b.id}`;
        return (
          <li key={key} className="sh-dup">
            <p className="fp-count">{REASONS[pair.reason]}</p>
            <div className="sh-dup-pair">
              <DupSide item={pair.a} />
              <DupSide item={pair.b} />
            </div>
            <div className="sh-dup-actions">
              <button type="button" className="btn btn-thread btn-sm" disabled={!!busy} onClick={() => act(pair, 'merge')}>
                {busy === key ? <span className="spin" aria-hidden="true" /> : <Icon name="layers" />} Merge
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => act(pair, 'keep_both')}>
                Keep both
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function DupSide({ item }: { item: ShelfItem }) {
  const p = item.paper;
  const facts = [p.origin === 'provider' ? (p.record?.label ?? 'Paper database') : p.origin === 'manual' ? 'Added manually' : 'Imported', p.doi && `DOI ${p.doi}`, item.note && 'has a note', item.tagIds.length && `${item.tagIds.length} tag${item.tagIds.length === 1 ? '' : 's'}`].filter(Boolean);
  return (
    <div className="sh-dup-side">
      <b className="sh-match-title">{p.title}</b>
      <span className="sh-match-meta">{[authorsShort(p.authors, 2), p.year, p.source].filter(Boolean).join(' · ')}</span>
      <span className="sh-dup-facts">{facts.join(' · ')}</span>
    </div>
  );
}
