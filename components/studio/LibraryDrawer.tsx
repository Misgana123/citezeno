'use client';

import { useEffect } from 'react';
import { timeAgo, type Saved } from '@/lib/library';
import { STYLES } from '@/lib/styles';
import { Icon } from '../Icon';

export function LibraryDrawer({
  items,
  currentId,
  onOpen,
  onDelete,
  onClose,
}: {
  items: Saved[];
  currentId: string | null;
  onOpen: (s: Saved) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  return (
    <div className="drawer-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-labelledby="lib-title">
        <header className="drawer-head">
          <div>
            <h2 id="lib-title">Library</h2>
            <p className="small">{items.length ? `${items.length} saved trace${items.length === 1 ? '' : 's'}, kept in this browser.` : 'Kept in this browser.'}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close the library">
            <Icon name="x" />
          </button>
        </header>
        {items.length === 0 ? (
          <div className="drawer-empty">
            <Icon name="history" />
            <p>Traces you run are saved here automatically, so you can come back to them later.</p>
          </div>
        ) : (
          <ul className="lib">
            {items.map((it) => (
              <li key={it.id} className={it.id === currentId ? 'current' : ''}>
                <button className="lib-open" onClick={() => onOpen(it)}>
                  <b>{it.title}</b>
                  <span className="lib-meta">
                    <span>{it.sources} source{it.sources === 1 ? '' : 's'}</span>
                    <span>{STYLES[it.style]?.name || it.style}</span>
                    <span>{timeAgo(it.savedAt)}</span>
                  </span>
                  <span className="lib-snip serif">{it.draft.slice(0, 140)}…</span>
                </button>
                <button className="icon-btn lib-del" onClick={() => onDelete(it.id)} aria-label={`Delete “${it.title}”`}>
                  <Icon name="trash" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
