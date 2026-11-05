'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import type { LibItem } from '@/lib/cloud';
import { timeAgo } from '@/lib/library';
import { STYLES } from '@/lib/styles';
import { Icon } from '../Icon';

export function LibraryDrawer({
  items,
  signedIn,
  currentId,
  onOpen,
  onDelete,
  onClose,
}: {
  items: LibItem[];
  signedIn: boolean;
  currentId: string | null;
  onOpen: (s: LibItem) => void;
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
            <p className="small">
              {items.length ? `${items.length} saved trace${items.length === 1 ? '' : 's'}, ` : ''}
              {signedIn ? 'synced to your account.' : 'kept in this browser.'}
            </p>
          </div>
          {signedIn && (
            <Link className="btn btn-ghost btn-sm" href="/library" style={{ marginLeft: 'auto' }}>
              Manage
            </Link>
          )}
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
                  {it.draft ? <span className="lib-snip serif">{it.draft.slice(0, 140)}…</span> : null}
                </button>
                <button className="icon-btn lib-del" onClick={() => onDelete(it.id)} aria-label={`Delete “${it.title}”`}>
                  <Icon name="trash" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {!signedIn && (
          <p className="drawer-note">
            <Link href="/sign-in?next=/studio">Sign in</Link> to keep your library on every device. Traces in this browser
            are added to your account.
          </p>
        )}
      </aside>
    </div>
  );
}
