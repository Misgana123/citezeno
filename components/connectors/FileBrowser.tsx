'use client';

import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { CloudFile } from '@/lib/providers/connectors/types';
import { Icon } from '../Icon';
import { connectorFetch } from './api';
import { AppLogo } from './AppLogo';
import type { PickedFile } from './pickers/google';

/* Choosing files from a connected app that has no picker of its own
   (OneDrive): its recent files, a search, and a tick on each. The list comes
   from our server; tokens never reach the browser. */

type Opts = { title?: string; multiple?: boolean; mimeTypes?: string[]; logo: string; label: string };

function Browser({ app, opts, done }: { app: string; opts: Opts; done(files: PickedFile[]): void }) {
  const [query, setQuery] = useState('');
  const [files, setFiles] = useState<CloudFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Map<string, CloudFile>>(new Map());
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setFiles(null);
      connectorFetch<{ files: CloudFile[] }>(`/api/connectors/files?app=${encodeURIComponent(app)}${query.trim() ? `&query=${encodeURIComponent(query.trim())}` : ''}`)
        .then((r) => setFiles(r.files))
        .catch((e) => setError((e as Error).message));
    }, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [app, query]);
  useEffect(() => {
    box.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && done([]);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [done]);

  const fits = (f: CloudFile) => f.kind !== 'folder' && (!opts.mimeTypes?.length || opts.mimeTypes.includes(f.mime) || (opts.mimeTypes.includes('application/pdf') && /\.(docx?|pdf)$/i.test(f.name)));
  const toggle = (f: CloudFile) => {
    if (!opts.multiple) return done([{ id: f.id, name: f.name, mime: f.mime, size: f.sizeBytes }]);
    setChosen((m) => {
      const n = new Map(m);
      if (n.has(f.id)) n.delete(f.id);
      else n.set(f.id, f);
      return n;
    });
  };

  return (
    <div className="st-scrim" onMouseDown={(e) => e.target === e.currentTarget && done([])}>
      <div className="st cfb" role="dialog" aria-modal="true" aria-label={opts.title ?? `Choose files from ${opts.label}`} tabIndex={-1} ref={box}>
        <div className="st-top">
          <h2 className="cfb-title">
            <AppLogo app={opts.logo} size={22} /> {opts.title ?? `Choose files from ${opts.label}`}
          </h2>
          <button type="button" className="st-ib" onClick={() => done([])} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="cfb-body">
          <label className="st-cfind cfb-find">
            <Icon name="search" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${opts.label}`} autoFocus />
          </label>
          {error ? (
            <div className="st-empty">{error}</div>
          ) : files == null ? (
            <div className="st-loading">Loading…</div>
          ) : files.length === 0 ? (
            <div className="st-empty">{query ? 'No files match.' : 'No recent files.'}</div>
          ) : (
            <ul className="cfb-list">
              {files.map((f) => {
                const ok = fits(f);
                return (
                  <li key={f.id}>
                    <button type="button" className={`cfb-row${chosen.has(f.id) ? ' is-on' : ''}`} disabled={!ok} onClick={() => toggle(f)} title={ok ? f.name : 'This kind of file can’t be added here'}>
                      <Icon name={f.kind === 'folder' ? 'folder' : f.kind === 'pdf' ? 'pdf' : 'file'} />
                      <span className="cfb-name">{f.name}</span>
                      <small>{f.modifiedAt ? new Date(f.modifiedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</small>
                      {opts.multiple && ok && <span className={`cfb-tick${chosen.has(f.id) ? ' is-on' : ''}`}>{chosen.has(f.id) && <Icon name="check" />}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {opts.multiple && (
          <div className="cfb-foot">
            <button type="button" className="st-btn" onClick={() => done([])}>
              Cancel
            </button>
            <button type="button" className="st-btn is-dark" disabled={!chosen.size} onClick={() => done([...chosen.values()].map((f) => ({ id: f.id, name: f.name, mime: f.mime, size: f.sizeBytes })))}>
              Add {chosen.size || ''} file{chosen.size === 1 ? '' : 's'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* Opens the browser over the page; resolves with the chosen files ([] when closed). */
export function browseCloudFiles(app: string, opts: Opts): Promise<PickedFile[]> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    // inside the app shell, so its colours apply
    (document.querySelector('.cz-app') ?? document.body).appendChild(host);
    const root = createRoot(host);
    const done = (files: PickedFile[]) => {
      root.unmount();
      host.remove();
      resolve(files);
    };
    root.render(<Browser app={app} opts={opts} done={done} />);
  });
}
