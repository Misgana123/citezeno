'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ImportSummary } from '@/lib/shelf/store/imports';
import { Icon } from '../../Icon';
import { formatCount } from '../../papers/format';
import { ShelfApiError, shelfFetch } from '../api';

/* Import a BibTeX (.bib) or RIS (.ris) file from Zotero, Mendeley, EndNote…
   The file is read here, queued on the server and worked through in the
   background; while this tab is open it keeps the import moving and shows
   progress, then a summary with the entries that failed and why. */
export function ImportTab({ projectId, onProgress }: { projectId: string | null; onProgress: () => void }) {
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newProject, setNewProject] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    // pick up an import that is still running
    shelfFetch<{ imports: { id: string; status: string }[] }>('/api/shelf/imports')
      .then((r) => {
        const open = r.imports.find((i) => i.status === 'queued');
        if (open) return shelfFetch<ImportSummary>(`/api/shelf/imports/${open.id}`).then((s) => alive.current && setSummary(s));
      })
      .catch(() => {});
    return () => {
      alive.current = false;
    };
  }, []);

  /* Keep asking for the next slice of work until it is done. */
  const follow = useCallback(
    async (id: string) => {
      for (let n = 0; alive.current && n < 2000; n++) {
        try {
          const s = await shelfFetch<ImportSummary>(`/api/shelf/imports/${id}/run`, { method: 'POST' });
          if (!alive.current) return;
          setSummary(s);
          onProgress();
          if (s.status === 'done') return;
        } catch {
          /* a hiccup: the background job carries on; try again shortly */
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    },
    [onProgress],
  );

  useEffect(() => {
    if (summary?.status === 'queued') void follow(summary.id);
    // follow once per import
  }, [summary?.id]);

  const start = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      const text = await file.text();
      const s = await shelfFetch<ImportSummary>('/api/shelf/imports', { method: 'POST', body: { fileName: file.name, text, projectId: newProject.trim() ? null : projectId, newProject: newProject.trim() || null } });
      setSummary(s);
    } catch (e) {
      setError(e instanceof ShelfApiError ? e.message : 'The file could not be read.');
    } finally {
      setBusy(false);
    }
  };

  if (summary) {
    const c = summary.counts;
    const processed = summary.total - c.pending;
    const pct = summary.total ? Math.round((processed / summary.total) * 100) : 100;
    return (
      <div className="sh-import">
        <div className="sh-up-head">
          <Icon name="doc" />
          <span className="sh-up-name">{summary.fileName}</span>
          <span className="small">{formatCount(summary.total)} references</span>
        </div>
        {summary.status === 'queued' ? (
          <div className="sh-up-progress" role="status">
            <span className="sh-bar">
              <i style={{ width: `${pct}%` }} />
            </span>
            <span className="small">
              {formatCount(processed)} of {formatCount(summary.total)}
            </span>
          </div>
        ) : (
          <p className="sh-up-done">
            <Icon name="check" /> Import finished.
          </p>
        )}
        <ul className="sh-import-counts">
          <li>
            <b>{formatCount(c.matched)}</b> matched in OpenAlex
          </li>
          <li>
            <b>{formatCount(c.added)}</b> added as written
          </li>
          <li>
            <b>{formatCount(c.duplicate)}</b> skipped as duplicates
          </li>
          <li className={c.failed ? 'is-bad' : undefined}>
            <b>{formatCount(c.failed)}</b> failed
          </li>
        </ul>
        {summary.status === 'queued' && <p className="sh-hint">You can close this window: the import carries on in the background.</p>}
        {summary.status === 'done' && summary.failed.length > 0 && (
          <details className="sh-import-failed" open={summary.failed.length <= 10}>
            <summary>Entries that failed</summary>
            <ul>
              {summary.failed.map((f, i) => (
                <li key={`${f.label}-${i}`}>
                  <b>{f.label}</b>: {f.reason}
                </li>
              ))}
            </ul>
          </details>
        )}
        {summary.status === 'done' && (
          <div className="sh-dup-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSummary(null)}>
              Import another file
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="sh-import">
      <label className="sh-drop">
        <Icon name="download" />
        <b>{busy ? 'Reading the file…' : 'Choose a .bib or .ris file'}</b>
        <span className="small">Exported from Zotero, Mendeley, EndNote or most reference managers. Papers with a DOI get their full details from OpenAlex; the rest are kept as written.</span>
        <input
          ref={input}
          type="file"
          accept=".bib,.bibtex,.ris,.txt,application/x-bibtex,application/x-research-info-systems"
          className="sh-file-input"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void start(f);
          }}
        />
      </label>
      <label className="field">
        Or put them in a new project <span className="fp-field-note">optional</span>
        <input className="input" value={newProject} onChange={(e) => setNewProject(e.target.value)} maxLength={80} placeholder="e.g. Thesis references" />
      </label>
      {error && (
        <p className="sh-form-err" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
