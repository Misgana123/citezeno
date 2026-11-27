'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from '../Icon';
import { formatCount } from './format';

/* The search box: a few keywords, a question, or a whole paragraph.
   Grows with its text; Enter searches, Shift+Enter adds a line. */
export function SearchBox({
  value,
  onChange,
  onSubmit,
  maxChars,
  busy,
  extra,
  placeholder = 'A topic, a question, or paste a paragraph such as an abstract',
  className = 'fp-search',
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  maxChars: number;
  busy: boolean;
  /* shown between the text and the Search button (Explore puts the mode switch there) */
  extra?: ReactNode;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const over = value.trim().length > maxChars;

  // grow with the text, and again when the box changes width
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el.parentElement ?? el);
    return () => ro.disconnect();
  }, [value]);

  return (
    <form
      className={className}
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label className="sr-only" htmlFor="fp-q">
        Search for papers
      </label>
      <Icon name="search" className="fp-search-ico" />
      <textarea
        id="fp-q"
        ref={ref}
        rows={1}
        value={value}
        maxLength={10_000}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
      {extra}
      <button className="btn btn-thread fp-search-go" type="submit" disabled={busy || !value.trim()}>
        {busy ? <span className="spin" aria-hidden="true" /> : <Icon name="arrow" />}
        <span>Search</span>
      </button>
      {over && (
        <p className="fp-search-warn" role="status">
          <Icon name="alert" /> Only the first {formatCount(maxChars)} characters are used for the search ({formatCount(value.trim().length)} typed).
        </p>
      )}
    </form>
  );
}
