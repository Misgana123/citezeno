'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Icon, type IconName } from './Icon';

export type Command = {
  id: string;
  group: string;
  label: string;
  meta?: string;
  icon?: IconName;
  keywords?: string;
  run: () => void;
};

/* ---- a tiny registry pages can add commands to ---- */
const sets = new Map<string, Command[]>();
const listeners = new Set<() => void>();
let snapshot: Command[] = [];
const emit = () => {
  snapshot = [...sets.values()].flat();
  listeners.forEach((l) => l());
};
export function registerCommands(key: string, cmds: Command[]) {
  sets.set(key, cmds);
  emit();
  return () => {
    sets.delete(key);
    emit();
  };
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const EMPTY: Command[] = [];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const extra = useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('citezeno:palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('citezeno:palette', onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const all: Command[] = useMemo(() => {
    const flipTheme = () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem('cz:theme', next);
      } catch {
        /* ignore */
      }
    };
    return [
      ...extra,
      { id: 'go-studio', group: 'Go to', label: 'Studio', icon: 'doc', run: () => router.push('/studio') },
      { id: 'go-styles', group: 'Go to', label: 'Citation styles', icon: 'quote', run: () => router.push('/styles') },
      { id: 'go-home', group: 'Go to', label: 'Home', icon: 'thread', run: () => router.push('/') },
      { id: 'theme', group: 'Appearance', label: 'Toggle light or dark theme', icon: 'moon', run: flipTheme },
    ];
  }, [extra, router]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return all;
    const parts = t.split(/\s+/);
    return all.filter((c) => {
      const hay = `${c.group} ${c.label} ${c.meta || ''} ${c.keywords || ''}`.toLowerCase();
      return parts.every((p) => hay.includes(p));
    });
  }, [all, q]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  if (!open) return null;

  const exec = (c: Command | undefined) => {
    if (!c) return;
    setOpen(false);
    c.run();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(shown.length - 1, s + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      exec(shown[sel]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  let lastGroup = '';
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="palette" role="dialog" aria-label="Command menu" onKeyDown={onKeyDown}>
        <div className="palette-input">
          <Icon name="search" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type a command or a citation style…"
            aria-label="Search commands"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
          />
          <span className="kbd">Esc</span>
        </div>
        <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {shown.length === 0 && <div className="palette-empty">No command matches “{q}”.</div>}
          {shown.map((c, i) => {
            const head = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <div key={c.id}>
                {head && <div className="palette-group">{head}</div>}
                <button
                  className="palette-item"
                  role="option"
                  aria-selected={i === sel}
                  onMouseMove={() => setSel(i)}
                  onClick={() => exec(c)}
                >
                  <Icon name={c.icon || 'arrow'} />
                  {c.label}
                  {c.meta && <span className="meta">{c.meta}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="palette-foot">
          <span><span className="kbd">↑</span> <span className="kbd">↓</span> to move</span>
          <span><span className="kbd">Enter</span> to run</span>
        </div>
      </div>
    </div>
  );
}
