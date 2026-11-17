'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Result } from '@/lib/types';
import { Icon } from '../Icon';

/* A searchable list of the manuscript's sentences; clicking one picks it.
   Used to re-attach a detached citation and to attach an imported reference. */
export function SentencePicker({
  result,
  label,
  onPick,
  onClose,
}: {
  result: Result;
  label: string;
  onPick: (sid: number) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const cites = useMemo(() => new Map(result.claims.filter((c) => c.ids.length).map((c) => [c.sid, c.ids.length])), [result]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return result.analysis.sentences.filter((s) => !needle || s.text.toLowerCase().includes(needle));
  }, [q, result]);

  useEffect(() => {
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) onClose();
    };
    // the click that opened the picker must not close it
    const t = setTimeout(() => document.addEventListener('mousedown', close), 0);
    document.addEventListener('keydown', close);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [onClose]);

  return (
    <div className="spick" ref={box} role="dialog" aria-label={label}>
      <div className="spick-head">
        <b>{label}</b>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <Icon name="x" />
        </button>
      </div>
      <label className="spick-search">
        <Icon name="search" />
        <input className="input" autoFocus placeholder="Find a sentence" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a sentence" />
      </label>
      <ul className="spick-list">
        {shown.map((s) => (
          <li key={s.index}>
            <button type="button" onClick={() => onPick(s.index)}>
              <span className="spick-n">{s.index + 1}</span>
              <span className="spick-t serif">{s.text}</span>
              {cites.get(s.index) ? (
                <span className="spick-c" title="Sources already cited on this sentence">
                  {cites.get(s.index)} cited
                </span>
              ) : null}
            </button>
          </li>
        ))}
        {!shown.length && <li className="spick-none">No sentence matches “{q}”.</li>}
      </ul>
    </div>
  );
}
