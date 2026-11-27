'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ConnectorView } from '@/lib/connectors/catalog';
import type { ImportOutcome } from '@/lib/connectors/service/import-references';
import type { RefCollection, RefLibrary } from '@/lib/providers/connectors/types';
import type { ImportSummary } from '@/lib/shelf/store/imports';
import { timeAgo } from '@/lib/library';
import { connectorFetch } from '../../connectors/api';
import { ConnectPrompt } from '../../connectors/ConnectPrompt';
import { Icon } from '../../Icon';
import { Select } from '../../Select';
import { ShelfApiError, shelfFetch } from '../api';
import { ImportSummaryView, useFollowImport } from './import-progress';

/* Import from a connected reference manager (Zotero): a whole library or one
   collection, through the shelf's own import. "Sync now" brings in only what
   changed since the last import of the same library or collection. */

const WHOLE = '*';

/* "Parent / Child" names, so nested collections read clearly in one list. */
function collectionPaths(list: RefCollection[]): { key: string; label: string }[] {
  const byKey = new Map(list.map((c) => [c.key, c]));
  const path = (c: RefCollection, depth = 0): string => {
    const parent = c.parentKey ? byKey.get(c.parentKey) : undefined;
    return parent && depth < 8 ? `${path(parent, depth + 1)} / ${c.name}` : c.name;
  };
  return list.map((c) => ({ key: c.key, label: path(c) })).sort((a, b) => a.label.localeCompare(b.label));
}

export function ReferenceAppTab({ app, projectId, onProgress }: { app: ConnectorView; projectId: string | null; onProgress: () => void }) {
  const connected = app.connection?.status === 'ok';
  const [libraries, setLibraries] = useState<RefLibrary[] | null>(null);
  const [library, setLibrary] = useState('user');
  const [collections, setCollections] = useState<RefCollection[] | null>(null);
  const [synced, setSynced] = useState<Record<string, string | null>>({});
  const [collection, setCollection] = useState(WHOLE);
  const [ownProject, setOwnProject] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useFollowImport(summary, setSummary, onProgress, alive);

  useEffect(() => {
    if (!connected) return;
    connectorFetch<{ libraries: RefLibrary[] }>('/api/connectors/references')
      .then((r) => {
        setLibraries(r.libraries);
        if (r.libraries.length && !r.libraries.some((l) => l.id === 'user')) setLibrary(r.libraries[0].id);
      })
      .catch((e) => setError((e as Error).message));
  }, [connected]);

  useEffect(() => {
    if (!connected || !libraries?.length) return;
    setCollections(null);
    setCollection(WHOLE);
    connectorFetch<{ collections: RefCollection[]; synced: Record<string, string | null> }>(`/api/connectors/references/collections?library=${encodeURIComponent(library)}`)
      .then((r) => {
        setCollections(r.collections);
        setSynced(r.synced);
      })
      .catch((e) => setError((e as Error).message));
  }, [connected, libraries, library]);

  const paths = useMemo(() => collectionPaths(collections ?? []), [collections]);

  if (!connected) return <ConnectPrompt app={app} back="/app/shelf">Bring your {app.label} library, or one collection, onto your shelf. Papers with a DOI get their full details from OpenAlex; papers already on your shelf are skipped.</ConnectPrompt>;
  if (summary) return <ImportSummaryView summary={summary} again={`Import more from ${app.label}`} onAgain={() => setSummary(null)} />;

  const lib = libraries?.find((l) => l.id === library);
  const name = collection === WHOLE ? (lib?.name ?? 'My Library') : (paths.find((p) => p.key === collection)?.label ?? 'Collection');
  const lastSync = synced[collection];
  // a collection may get its own project; the whole library goes where the dialog says
  const intoOwn = ownProject && collection !== WHOLE && !lastSync;

  const start = async (sync: boolean) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const out = await shelfFetch<ImportOutcome & { import: ImportSummary | null }>('/api/connectors/references/import', {
        method: 'POST',
        body: { libraryId: library, collectionKey: collection === WHOLE ? null : collection, name, sync, ...(intoOwn ? { newProject: name.slice(0, 120) } : { projectId }) },
      });
      if (out.import) setSummary(out.import);
      else setNote(sync ? 'Nothing new since the last sync.' : `Nothing to import from ${name}.`);
      setSynced((s) => ({ ...s, [collection]: new Date().toISOString() }));
    } catch (e) {
      setError(e instanceof ShelfApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sh-import">
      <p className="small">
        Connected as <b>{app.connection?.label}</b>. Choose what to bring onto your shelf; papers already there are skipped.
      </p>
      {!libraries || !collections ? (
        error ? null : <p className="sh-hint">Loading your {app.label} library…</p>
      ) : (
        <>
          {libraries.length > 1 && (
            <label className="field">
              Library
              <Select value={library} onChange={(v) => setLibrary(String(v))} options={libraries.map((l) => ({ value: l.id, label: l.kind === 'group' ? `${l.name} (group)` : l.name }))} />
            </label>
          )}
          <label className="field">
            What to import
            <Select value={collection} onChange={(v) => setCollection(String(v))} search={paths.length > 8 ? 'Find a collection' : undefined} options={[{ value: WHOLE, label: `The whole library (${lib?.name ?? 'My Library'})` }, ...paths.map((p) => ({ value: p.key, label: p.label }))]} />
          </label>
          {!lastSync && collection !== WHOLE && (
            <label className="check">
              <input type="checkbox" checked={ownProject} onChange={(e) => setOwnProject(e.target.checked)} />
              Put them in a new project named “{name.slice(0, 80)}”
            </label>
          )}
          {lastSync && <p className="small">Last imported {timeAgo(new Date(lastSync).getTime())}. Sync now brings in only what was added or changed since, into the same project.</p>}
          <div className="sh-dup-actions">
            {lastSync ? (
              <>
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => start(true)}>
                  <Icon name="download" /> {busy ? 'Syncing…' : 'Sync now'}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => start(false)}>
                  Import all again
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-sm" disabled={busy} onClick={() => start(false)}>
                <Icon name="download" /> {busy ? 'Reading your library…' : `Import from ${app.label}`}
              </button>
            )}
          </div>
        </>
      )}
      {note && <p className="sh-hint">{note}</p>}
      {error && (
        <p className="sh-form-err" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
