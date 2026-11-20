'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ACCOUNT_MAX, ACCOUNT_NOTICE, timeAgo } from '@/lib/library';
import { formatExpiry, isExpired } from '@/lib/share-access';
import { STYLES } from '@/lib/styles';
import { Icon } from '../Icon';
import { ShareDialog } from '../share/ShareDialog';
import { DownloadAll, LibraryNearlyFull } from './DownloadAll';
import { toast } from '../toast';

export type LibRow = {
  id: string;
  title: string;
  style: string;
  mode: string;
  sources: number;
  snippet: string;
  savedAt: number;
  shareToken: string | null;
  shareViews: number;
  /* ms since epoch, or null when the link never expires */
  shareExpiresAt: number | null;
  shareLocked: boolean;
};

type Sort = 'new' | 'old' | 'title' | 'sources';

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

export function LibraryManager({ initial, owner }: { initial: LibRow[]; owner: string }) {
  const [rows, setRows] = useState(initial);
  const [sharing, setSharing] = useState<LibRow | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('new');
  const [style, setStyle] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const styles = useMemo(() => [...new Set(rows.map((r) => r.style))].filter((s) => STYLES[s]), [rows]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter((r) => (!style || r.style === style) && (!needle || `${r.title} ${r.snippet}`.toLowerCase().includes(needle)));
    const by: Record<Sort, (a: LibRow, b: LibRow) => number> = {
      new: (a, b) => b.savedAt - a.savedAt,
      old: (a, b) => a.savedAt - b.savedAt,
      title: (a, b) => a.title.localeCompare(b.title),
      sources: (a, b) => b.sources - a.sources,
    };
    return list.sort(by[sort]);
  }, [rows, q, style, sort]);

  const patch = (id: string, p: Partial<LibRow>) => setRows((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const rename = async (id: string) => {
    const title = draftTitle.trim();
    setEditing(null);
    if (!title || title === rows.find((r) => r.id === id)?.title) return;
    try {
      await call(`/api/traces/${id}`, 'PATCH', { title });
      patch(id, { title });
      toast('Renamed');
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  const remove = async (id: string) => {
    setConfirmDel(null);
    try {
      await call(`/api/traces/${id}`, 'DELETE');
      setRows((xs) => xs.filter((x) => x.id !== id));
      toast('Deleted');
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  const unshare = async (r: LibRow) => {
    try {
      await call(`/api/traces/${r.id}/share`, 'DELETE');
      patch(r.id, { shareToken: null, shareViews: 0, shareExpiresAt: null, shareLocked: false });
      toast('Link turned off');
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  if (!rows.length)
    return (
      <div className="lib-empty">
        <Icon name="history" />
        <h2 className="h3">Nothing here yet</h2>
        <p>Traces you run in the studio are saved here automatically.</p>
        <Link className="btn btn-thread" href="/app/citation">
          Open the studio
        </Link>
      </div>
    );

  return (
    <div className="libm">
      {rows.length >= ACCOUNT_NOTICE && <LibraryNearlyFull count={rows.length} max={ACCOUNT_MAX} />}
      <div className="libm-bar">
        <label className="libm-search">
          <Icon name="search" />
          <input className="input" placeholder="Search titles and drafts" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the library" />
        </label>
        <select className="select" value={style} onChange={(e) => setStyle(e.target.value)} aria-label="Filter by style">
          <option value="">All styles</option>
          {styles.map((s) => (
            <option key={s} value={s}>
              {STYLES[s].name}
            </option>
          ))}
        </select>
        <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="new">Newest first</option>
          <option value="old">Oldest first</option>
          <option value="title">Title A–Z</option>
          <option value="sources">Most sources</option>
        </select>
        <DownloadAll items={rows} />
      </div>
      <p className="small" style={{ margin: '0 0 12px' }}>
        {shown.length} of {rows.length} trace{rows.length === 1 ? '' : 's'} · {rows.reduce((n, r) => n + r.sources, 0)} sources in all
      </p>

      <ul className="libm-list">
        {shown.map((r) => (
          <li key={r.id}>
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
                <Link className="libm-title" href={`/app/citation?open=${encodeURIComponent(r.id)}`}>
                  {r.title}
                </Link>
              )}
              <span className="lib-meta">
                <span>
                  {r.sources} source{r.sources === 1 ? '' : 's'}
                </span>
                <span>{STYLES[r.style]?.name || r.style}</span>
                <span>{timeAgo(r.savedAt)}</span>
                {r.shareToken && (
                  <span className="shared">
                    <Icon name="globe" /> Shared · {r.shareViews} view{r.shareViews === 1 ? '' : 's'}
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
              {r.snippet && <span className="lib-snip serif">{r.snippet}…</span>}
            </div>
            <div className="libm-actions">
              <Link className="btn btn-thread btn-sm" href={`/app/citation?open=${encodeURIComponent(r.id)}`}>
                Open
              </Link>
              {r.shareToken ? (
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
              )}
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
      {sharing && (
        <ShareDialog
          id={sharing.id}
          title={sharing.title}
          owner={owner}
          onClose={() => setSharing(null)}
          onChange={(s) =>
            patch(sharing.id, {
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
