'use client';

import { useState } from 'react';
import { shorten } from '@/lib/engine';
import type { Result } from '@/lib/types';
import { Icon } from '../Icon';
import { SentencePicker } from './SentencePicker';

/* Citations whose sentence was reworded too much or deleted. They stay here,
   out of the manuscript and reference list, until the user decides. */
export function DetachedList({
  result,
  onReattach,
  onRemove,
}: {
  result: Result;
  onReattach: (k: number, sid: number) => void;
  onRemove: (k: number) => void;
}) {
  const [picking, setPicking] = useState<number | null>(null);
  const list = result.detached || [];
  if (!list.length) return null;
  return (
    <section className="detached" aria-labelledby="det-title">
      <header className="detached-head">
        <Icon name="alert" />
        <div>
          <h3 id="det-title">
            {list.length} detached citation{list.length === 1 ? '' : 's'}
          </h3>
          <p>
            {list.length === 1 ? 'Its sentence was' : 'Their sentences were'} reworded too much or removed, so{' '}
            {list.length === 1 ? 'it is' : 'they are'} left out of your manuscript and reference list. Pick the sentence{' '}
            {list.length === 1 ? 'it' : 'each one'} belongs to now, or remove {list.length === 1 ? 'it' : 'them'}.
          </p>
        </div>
      </header>
      <ul className="detached-list">
        {list.map((d, k) => (
          <li key={k}>
            <div className="detached-main">
              <span className="detached-was serif">“{shorten(d.was, 26)}”</span>
              <span className="detached-srcs">
                {d.ids.map((id) => {
                  const s = result.db.get(id);
                  return s ? (
                    <span key={id} title={s.title}>
                      {(s.authors[0]?.family || s.site || 'Untitled').slice(0, 30)}
                      {s.authors.length > 1 ? ' et al.' : ''}, {s.year || 'n.d.'}
                    </span>
                  ) : null;
                })}
              </span>
            </div>
            <div className="detached-actions">
              <button type="button" className="btn btn-thread btn-sm" onClick={() => setPicking(picking === k ? null : k)} aria-expanded={picking === k}>
                <Icon name="thread" /> Re-attach
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRemove(k)}>
                Remove
              </button>
            </div>
            {picking === k && (
              <SentencePicker
                result={result}
                label="Re-attach to which sentence?"
                onClose={() => setPicking(null)}
                onPick={(sid) => {
                  setPicking(null);
                  onReattach(k, sid);
                }}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
