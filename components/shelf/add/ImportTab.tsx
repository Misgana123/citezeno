'use client';

import { useEffect, useRef, useState } from 'react';
import type { ImportSummary } from '@/lib/shelf/store/imports';
import { Icon } from '../../Icon';
import { ShelfApiError, shelfFetch } from '../api';
import { ImportSummaryView, useFollowImport } from './import-progress';

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

  useFollowImport(summary, setSummary, onProgress, alive);

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

  if (summary) return <ImportSummaryView summary={summary} again="Import another file" onAgain={() => setSummary(null)} />;

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
