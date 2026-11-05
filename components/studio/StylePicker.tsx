'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { SPECIMENS, STYLES, STYLE_GROUPS, plain, specimen } from '@/lib/styles';
import { Icon } from '../Icon';

/* A searchable style menu that previews how each style cites in the text. */
export function StylePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const st = STYLES[value];

  const examples = useMemo(() => {
    const m: Record<string, string> = {};
    Object.keys(STYLES).forEach((id) => {
      const sp = specimen(id, SPECIMENS.article);
      m[id] = sp.style.family === 'notes' ? 'Footnote¹' : sp.style.family === 'numeric' ? `claim ${plain(sp.inText)}` : plain(sp.inText);
    });
    return m;
  }, []);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setTimeout(() => input.current?.focus(), 10);
    const off = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', off);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', off);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const t = q.trim().toLowerCase();
  return (
    <div className="sp" ref={box}>
      <button className="sp-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="sp-name">
          <b>{st.name}</b>
          <small>{st.edition}</small>
        </span>
        <span className="sp-ex serif">{examples[value]}</span>
        <Icon name="chevron" className="sp-chev" />
      </button>
      {open && (
        <div className="sp-pop" role="listbox" aria-label="Citation style">
          <div className="sp-search">
            <Icon name="search" />
            <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a style" aria-label="Find a style" />
          </div>
          <div className="sp-list">
            {STYLE_GROUPS.map(([g, ids]) => {
              const shown = ids.filter((id) => !t || `${STYLES[id].name} ${STYLES[id].edition} ${g}`.toLowerCase().includes(t));
              if (!shown.length) return null;
              return (
                <div key={g}>
                  <div className="sp-group">{g}</div>
                  {shown.map((id) => (
                    <button
                      key={id}
                      role="option"
                      aria-selected={id === value}
                      className="sp-opt"
                      onClick={() => {
                        onChange(id);
                        setOpen(false);
                      }}
                    >
                      <span className="sp-name">
                        <b>{STYLES[id].name}</b>
                        <small>{STYLES[id].edition}</small>
                      </span>
                      <span className="sp-ex serif">{examples[id]}</span>
                      {id === value && <Icon name="check" className="sp-tick" />}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
