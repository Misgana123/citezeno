'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { LibItem } from '@/lib/cloud';
import { ACCOUNT_MAX, ACCOUNT_NOTICE, timeAgo } from '@/lib/library';
import { formatExpiry, isExpired } from '@/lib/share-access';
import { STYLES } from '@/lib/styles';
import { Icon } from '../Icon';
import { Select } from '../Select';
import { ShareDialog } from '../share/ShareDialog';
import { DownloadAll, LibraryNearlyFull } from '../library/DownloadAll';
import { toast } from '../toast';

type Sort = 'new' | 'old' | 'title' | 'sources';

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

/* The studio's library: every saved trace, to search, filter, sort, open,
   rename, share (and manage the link), download or delete. Renaming and
   sharing need an account; signed out, the library lives in this browser. */
export function LibraryDialog({
  items,
  signedIn,
  currentId,
  owner,
  onOpen,
  onDelete,
  onPatch,
  onClose,
}: {
  items: LibItem[];
  signedIn: boolean;
  currentId: string | null;
  owner: string;
  onOpen: (s: LibItem) => void;
  onDelete: (id: string) => void;
  onPatch: (id: string, p: Partial<LibItem>) => void;
  onClose: () => void;
}) {
  const [sharing, setSharing] = useState<LibItem | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('new');
  const [style, setStyle] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  // Escape closes the library, unless the share dialog on top of it is open
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !sharing && !editing && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose, sharing, editing]);

  const styles = useMemo(() => [...new Set(items.map((r) => r.style))].filter((s) => STYLES[s]), [items]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = items.filter((r) => (!style || r.style === style) && (!needle || `${r.title} ${r.draft || ''}`.toLowerCase().includes(needle)));
    const by: Record<Sort, (a: LibItem, b: LibItem) => number> = {
      new: (a, b) => b.savedAt - a.savedAt,
      old: (a, b) => a.savedAt - b.savedAt,
      title: (a, b) => a.title.localeCompare(b.title),
      sources: (a, b) => b.sources - a.sources,
    };
    return [...list].sort(by[sort]);
  }, [items, q, style, sort]);

  const rename = async (id: string) => {
    const title = draftTitle.replace(/\s+/g, ' ').trim();
    setEditing(null);
    if (!title || title === items.find((r) => r.id === id)?.title) return;
    try {
      await call(`/api/traces/${encodeURIComponent(id)}`, 'PATCH', { title });
      onPatch(id, { title, titleLocked: true });
      toast('Renamed');
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  const unshare = async (r: LibItem) => {
    try {
      await call(`/api/traces/${encodeURIComponent(r.id)}/share`, 'DELETE');
      onPatch(r.id, { shareToken: null, shareViews: 0, shareExpiresAt: null, shareLocked: false });
      toast('Link turned off');
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  const remove = (id: string) => {
    setConfirmDel(null);
    onDelete(id);
  };

  const total = items.reduce((n, r) => n + r.sources, 0);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog libd" role="dialog" aria-modal="true" aria-labelledby="lib-title">
        <header className="libd-head">
          <div>
            <h2 id="lib-title">Library</h2>
            <p className="small">
              {items.length ? `${items.length} saved trace${items.length === 1 ? '' : 's'}, ` : ''}
              {signedIn ? 'synced to your account.' : 'kept in this browser.'}
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close the library">
            <Icon name="x" />
          </button>
        </header>

        {items.length === 0 ? (
          <div className="lib-empty">
            <Icon name="history" />
            <h3 className="h3">Nothing here yet</h3>
            <p>Traces you run are saved here automatically, so you can come back to them later.</p>
          </div>
        ) : (
          <>
            {signedIn && items.length >= ACCOUNT_NOTICE && <LibraryNearlyFull count={items.length} max={ACCOUNT_MAX} />}
            <div className="libm-bar">
              <label className="libm-search">
                <Icon name="search" />
                <input className="input" placeholder="Search titles and drafts" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the library" />
              </label>
              <Select<string> value={style} onChange={setStyle} aria-label="Filter by style" options={[{ value: '', label: 'All styles' }, ...styles.map((s) => ({ value: s, label: STYLES[s].name }))]} />
              <Select<Sort>
                value={sort}
                onChange={setSort}
                aria-label="Sort"
                options={[
                  { value: 'new', label: 'Newest first' },
                  { value: 'old', label: 'Oldest first' },
                  { value: 'title', label: 'Title A–Z' },
                  { value: 'sources', label: 'Most sources' },
                ]}
              />
              <DownloadAll items={items} />
            </div>
            <p className="libm-count">
              <b>{shown.length}</b> of {items.length} trace{items.length === 1 ? '' : 's'} · <b>{total}</b> sources in all
            </p>

            <ul className="libm-list libd-list">
              {shown.map((r) => (
                <li key={r.id} className={r.id === currentId ? 'current' : ''}>
                  <span className="libm-thumb" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                  <div className="libm-main">
                    {editing === r.id ? (
                      <input
                        className="input"
                        autoFocus
                        value={draftTitle}
                        maxLength={200}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        onBlur={() => rename(r.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') rename(r.id);
                          if (e.key === 'Escape') setEditing(null);
                        }}
                        aria-label="New title"
                      />
                    ) : (
                      <button type="button" className="libm-title" onClick={() => onOpen(r)}>
                        {r.title}
                      </button>
                    )}
                    <span className="lib-meta">
                      {r.id === currentId && <span className="open-now">Open now</span>}
                      <span>
                        {r.sources} source{r.sources === 1 ? '' : 's'}
                      </span>
                      <span>{STYLES[r.style]?.name || r.style}</span>
                      <span>{timeAgo(r.savedAt)}</span>
                      {r.shareToken && (
                        <span className="shared">
                          <Icon name="globe" /> Shared · {r.shareViews ?? 0} view{r.shareViews === 1 ? '' : 's'}
                        </span>
                      )}
                      {r.shareToken && r.shareExpiresAt != null && (
                        <span className={isExpired(r.shareExpiresAt) ? 'expired' : 'expires'} title="Change it in Link settings" suppressHydrationWarning>
                          <Icon name="clock" /> {isExpired(r.shareExpiresAt) ? 'Link expired' : 'Expires'} {formatExpiry(r.shareExpiresAt)}
                        </span>
                      )}
                      {r.shareToken && r.shareLocked && (
                        <span className="locked" title="Viewers need a password. Change or remove it in Link settings.">
                          <Icon name="lock" /> Password
                        </span>
                      )}
                    </span>
                    {r.draft && <span className="lib-snip serif">{r.draft.slice(0, 160)}…</span>}
                  </div>
                  <div className="libm-actions">
                    <button type="button" className="btn btn-thread btn-sm" onClick={() => onOpen(r)}>
                      Open
                    </button>
                    {signedIn &&
                      (r.shareToken ? (
                        <>
                          <a className="btn btn-ghost btn-sm" href={`/s/${r.shareToken}`} target="_blank" rel="noopener">
                            <Icon name="external" /> View
                          </a>
                          <button className="btn btn-ghost btn-sm" onClick={() => setSharing(r)} title="Change the design, style, expiry or password, or turn the link off">
                            <Icon name="globe" /> Link settings
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => unshare(r)}>
                            Stop sharing
                          </button>
                        </>
                      ) : (
                        <button className="btn btn-ghost btn-sm" onClick={() => setSharing(r)}>
                          <Icon name="globe" /> Share
                        </button>
                      ))}
                    {signedIn && (
                      <button
                        className="icon-btn"
                        title="Rename"
                        aria-label={`Rename “${r.title}”`}
                        onClick={() => {
                          setDraftTitle(r.title);
                          setEditing(r.id);
                        }}
                      >
                        <Icon name="wand" />
                      </button>
                    )}
                    {confirmDel === r.id ? (
                      <button className="btn btn-danger btn-sm" onClick={() => remove(r.id)} onBlur={() => setConfirmDel(null)} autoFocus>
                        Delete?
                      </button>
                    ) : (
                      <button className="icon-btn" title="Delete" aria-label={`Delete “${r.title}”`} onClick={() => setConfirmDel(r.id)}>
                        <Icon name="trash" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {!shown.length && <p className="small">No trace matches your search.</p>}
          </>
        )}

        {!signedIn && (
          <p className="drawer-note">
            <Link href="/sign-in?next=/app/citation">Sign in</Link> to keep your library on every device. Traces in this browser are added to your account.
          </p>
        )}
      </div>

      {sharing && (
        <ShareDialog
          id={sharing.id}
          title={sharing.title}
          owner={owner}
          onClose={() => setSharing(null)}
          onChange={(s) =>
            onPatch(sharing.id, {
              shareToken: s?.token ?? null,
              shareViews: s?.views ?? 0,
              shareExpiresAt: s?.expiresAt ? Date.parse(s.expiresAt) : null,
              shareLocked: Boolean(s?.hasPassword),
            })
          }
        />
      )}
    </div>
  );
}
