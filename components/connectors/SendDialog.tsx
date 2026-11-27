'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ConnectorView } from '@/lib/connectors/catalog';
import type { SendResult } from '@/lib/connectors/service/send-shelf';
import type { NotesItem, RefCollection, RefLibrary } from '@/lib/providers/connectors/types';
import { Icon } from '../Icon';
import { Select } from '../Select';
import { toast } from '../toast';
import { connectorFetch } from './api';

/* Send shelf papers (those in view, or a selection) to a connected app: a new
   Google Sheet, rows in a Notion database, or a Zotero collection. */

export type SendKind = 'sheets' | 'pages' | 'references';

const NEW = '__new__';
const LIBRARY_ROOT = '';

export function SendDialog({ app, kind, query, count, defaultTitle, onClose }: { app: ConnectorView; kind: SendKind; query: URLSearchParams; count: number | null; defaultTitle: string; onClose: () => void }) {
  const [title, setTitle] = useState(defaultTitle);
  const [databases, setDatabases] = useState<NotesItem[] | null>(null);
  const [database, setDatabase] = useState('');
  const [libraries, setLibraries] = useState<RefLibrary[] | null>(null);
  const [library, setLibrary] = useState('user');
  const [collections, setCollections] = useState<RefCollection[] | null>(null);
  const [collection, setCollection] = useState(NEW);
  const [newCollection, setNewCollection] = useState(defaultTitle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<SendResult | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (kind === 'pages')
      connectorFetch<{ databases: NotesItem[] }>('/api/connectors/pages/databases')
        .then((r) => {
          setDatabases(r.databases);
          if (r.databases[0]) setDatabase(r.databases[0].id);
        })
        .catch((e) => setError((e as Error).message));
    if (kind === 'references')
      connectorFetch<{ libraries: RefLibrary[] }>('/api/connectors/references')
        .then((r) => {
          const writable = r.libraries.filter((l) => l.canWrite);
          setLibraries(writable);
          if (writable[0] && !writable.some((l) => l.id === 'user')) setLibrary(writable[0].id);
        })
        .catch((e) => setError((e as Error).message));
  }, [kind]);

  useEffect(() => {
    if (kind !== 'references' || !libraries?.length) return;
    setCollections(null);
    connectorFetch<{ collections: RefCollection[] }>(`/api/connectors/references/collections?library=${encodeURIComponent(library)}`)
      .then((r) => setCollections(r.collections))
      .catch((e) => setError((e as Error).message));
  }, [kind, libraries, library]);

  const listQuery = useMemo(() => {
    const q = new URLSearchParams(query);
    q.delete('page');
    q.delete('perPage');
    return q.toString();
  }, [query]);

  const target = () => {
    if (kind === 'sheets') return { to: 'sheets', title };
    if (kind === 'pages') return { to: 'pages', databaseId: database };
    return { to: 'references', libraryId: library, collectionKey: collection === NEW || collection === LIBRARY_ROOT ? null : collection, newCollection: collection === NEW ? newCollection : null };
  };
  const ready = kind === 'sheets' ? true : kind === 'pages' ? !!database : !!libraries?.length && (collection !== NEW || !!newCollection.trim());

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await connectorFetch<SendResult & { leftOut: number }>('/api/connectors/send', { method: 'POST', body: { query: listQuery, target: target() } });
      setDone(r);
      toast(`Sent ${r.sent} paper${r.sent === 1 ? '' : 's'} to ${r.app}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const papers = count == null ? 'these papers' : `${count.toLocaleString('en-US')} paper${count === 1 ? '' : 's'}`;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog sh-add-dialog conn-send" role="dialog" aria-modal="true" aria-labelledby="conn-send-h">
        <div className="sh-add-head">
          <h2 id="conn-send-h">Send to {kind === 'sheets' ? 'Google Sheets' : app.label}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        {done ? (
          <div className="conn-send-done">
            <p className="sh-up-done">
              <Icon name="check" /> Sent {done.sent.toLocaleString('en-US')} paper{done.sent === 1 ? '' : 's'} to <b>{done.where}</b> in {done.app}.
            </p>
            {done.failed > 0 && <p className="small">{done.failed} couldn’t be added.</p>}
            <div className="sh-dup-actions">
              {done.url && (
                <a className="btn btn-sm" href={done.url} target="_blank" rel="noreferrer">
                  Open in {kind === 'sheets' ? 'Google Sheets' : done.app}
                </a>
              )}
              <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        ) : (
          <form className="conn-send-form" onSubmit={send}>
            <p className="small">
              {papers} go to your {app.label} ({app.connection?.label}).
            </p>
            {kind === 'sheets' && (
              <label className="field">
                Spreadsheet name
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
              </label>
            )}
            {kind === 'pages' &&
              (!databases ? (
                !error && <p className="sh-hint">Loading the databases you shared…</p>
              ) : databases.length ? (
                <label className="field">
                  Database
                  <Select value={database} onChange={(v) => setDatabase(String(v))} search={databases.length > 8 ? 'Find a database' : undefined} options={databases.map((d) => ({ value: d.id, label: d.title }))} />
                  <span className="small">Papers fill the columns whose names match: Title, Authors, Year, Source, DOI, Link, Tags…</span>
                </label>
              ) : (
                <p className="small">No databases are shared with Citezeno yet. In Notion, open a database, choose ••• → Connections and add Citezeno, then try again.</p>
              ))}
            {kind === 'references' &&
              (!libraries || (libraries.length > 0 && !collections) ? (
                !error && <p className="sh-hint">Loading your {app.label} library…</p>
              ) : !libraries.length ? (
                <p className="small">Citezeno may only read your {app.label} library. Connect it again with permission to make changes.</p>
              ) : (
                <>
                  {libraries.length > 1 && (
                    <label className="field">
                      Library
                      <Select value={library} onChange={(v) => setLibrary(String(v))} options={libraries.map((l) => ({ value: l.id, label: l.kind === 'group' ? `${l.name} (group)` : l.name }))} />
                    </label>
                  )}
                  <label className="field">
                    Collection
                    <Select
                      value={collection}
                      onChange={(v) => setCollection(String(v))}
                      search={(collections?.length ?? 0) > 8 ? 'Find a collection' : undefined}
                      options={[{ value: NEW, label: 'A new collection…' }, { value: LIBRARY_ROOT, label: 'No collection (just the library)' }, ...(collections ?? []).map((c) => ({ value: c.key, label: c.name }))]}
                    />
                  </label>
                  {collection === NEW && (
                    <label className="field">
                      New collection’s name
                      <input className="input" value={newCollection} onChange={(e) => setNewCollection(e.target.value)} maxLength={200} />
                    </label>
                  )}
                </>
              ))}
            {error && (
              <p className="sh-form-err" role="alert">
                {error}
              </p>
            )}
            <div className="sh-dup-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
                Cancel
              </button>
              <button className="btn btn-sm" disabled={busy || !ready}>
                {busy ? 'Sending…' : `Send ${papers}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
