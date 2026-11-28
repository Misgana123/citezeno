'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { Paper } from '@/lib/papers/types';
import type { DupSummary } from '@/lib/shelf/api/saved-response';
import type { CompleteResult } from '@/lib/shelf/service/pdf-upload';
import type { ShelfItem } from '@/lib/shelf/types';
import { connectHref } from '../../connectors/api';
import { pickCloudFiles, PICK_PDF } from '../../connectors/pick';
import { useConnectors } from '../../connectors/useConnectors';
import { serviceFor } from '../../settings/customize/cards';
import { Icon } from '../../Icon';
import { toast } from '../../toast';
import { authorsShort } from '../../papers/format';
import { readHref } from '../../reader/api';
import { draftToInput, emptyDraft, ManualForm } from '../add/ManualForm';
import { ShelfApiError, shelfFetch } from '../api';
import { savedToast } from '../dup-hint';
import { markSaved } from '../saved-store';
import { fileSize, uploadPdf, type UploadStage } from './upload';

/* A PDF from the user's computer, or picked from a connected app (fetched by our server). */
type Source = { name: string; size: number | null; send: (onStage: (s: UploadStage, progress?: number) => void) => Promise<CompleteResult> };

const localSource = (file: File): Source => ({ name: file.name, size: file.size, send: (onStage) => uploadPdf(file, { onStage }) });
const cloudSource = (app: string) => (f: { id: string; name: string; size: number | null }): Source => ({
  name: f.name,
  size: f.size,
  send: async (onStage) => {
    onStage('reading');
    return shelfFetch<CompleteResult>('/api/connectors/files/pdf', { method: 'POST', body: { fileId: f.id, app } });
  },
});

type Row = {
  key: string;
  file: { name: string; size: number | null };
  stage: UploadStage | 'match' | 'done' | 'error' | 'skipped';
  progress: number;
  result?: CompleteResult;
  error?: ShelfApiError;
  manual?: boolean;
  busy?: boolean;
  item?: ShelfItem;
};

/* Upload one or several PDFs. Each is read for its DOI or title, and the user
   confirms which paper it is (or types the details) before it is added. */
export function PdfUploadTab({
  projectId,
  onAdded,
  onManageFiles,
  initialFiles,
}: {
  projectId: string | null;
  onAdded: (item: ShelfItem) => void;
  onManageFiles: () => void;
  /* PDFs dropped on the page before the dialog opened: uploaded straight away */
  initialFiles?: File[];
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [drag, setDrag] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [maxBytes, setMaxBytes] = useState<number | null>(null);
  useEffect(() => {
    shelfFetch<{ enabled: boolean; maxFileBytes: number }>('/api/shelf/pdfs')
      .then((r) => {
        setEnabled(r.enabled);
        setMaxBytes(r.maxFileBytes);
      })
      .catch(() => {});
  }, []);
  const input = useRef<HTMLInputElement>(null);
  // every app with cloud files (Google Drive, OneDrive)
  const clouds = useConnectors().appsFor('files');
  const fromCloud = async (app: string, label: string, logo: string) => {
    try {
      const picked = await pickCloudFiles(app, { mimeTypes: PICK_PDF, multiple: true, title: 'Choose PDFs to add', label, logo });
      if (picked.length) void run(picked.map(cloudSource(app)));
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const patch = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const start = (files: File[]) => run(files.map(localSource));
  const run = async (sources: Source[]) => {
    const added = sources.map((src, i) => ({ key: `${Date.now()}-${i}-${src.name}`, file: { name: src.name, size: src.size }, src, stage: 'starting' as const, progress: 0 }));
    setRows((rs) => [...added.map(({ src: _src, ...row }) => row), ...rs]);
    // one at a time keeps within storage and OpenAlex limits
    for (const r of added) {
      try {
        const result = await r.src.send((stage, progress) => patch(r.key, { stage, progress: progress ?? 0 }));
        patch(r.key, { stage: 'match', result });
      } catch (e) {
        patch(r.key, { stage: 'error', error: e instanceof ShelfApiError ? e : new ShelfApiError('unavailable', 'The upload failed.') });
      }
    }
  };

  // files dropped on the page: start once (a ref, so a remount doesn't upload twice)
  const dropped = useRef(false);
  useEffect(() => {
    if (dropped.current || !initialFiles?.length) return;
    dropped.current = true;
    void start(initialFiles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirm = async (r: Row, body: object) => {
    patch(r.key, { busy: true });
    try {
      const out = await shelfFetch<{ item: ShelfItem; possibleDuplicates: DupSummary[] }>(`/api/shelf/pdfs/${r.result!.pdf.id}/confirm`, { method: 'POST', body: { ...body, projectId } });
      if (out.item.paper.provider) markSaved(out.item.paper.id, out.item.id);
      patch(r.key, { stage: 'done', item: out.item, busy: false, manual: false });
      savedToast(out.item.addedVia === 'upload' ? 'Added to My uploads' : 'PDF attached to the paper in your Library', out.possibleDuplicates);
      onAdded(out.item);
      return null;
    } catch (e) {
      patch(r.key, { busy: false });
      return (e as Error).message;
    }
  };

  const skip = async (r: Row) => {
    patch(r.key, { busy: true });
    await shelfFetch(`/api/shelf/pdfs/${r.result!.pdf.id}`, { method: 'DELETE' }).catch(() => {});
    patch(r.key, { stage: 'skipped', busy: false });
  };

  if (!enabled) {
    return (
      <div className="fp-error" role="status">
        <Icon name="alert" />
        <p>PDF uploads aren’t set up yet. You can still add papers by DOI, link, title or by hand.</p>
      </div>
    );
  }

  return (
    <div className="sh-up">
      <label
        className={`sh-drop${drag ? ' is-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const files = [...e.dataTransfer.files].filter((f) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
          if (files.length) void start(files);
        }}
      >
        <Icon name="upload" />
        <b>Drop PDFs here or choose files</b>
        <span className="small">{maxBytes ? `Up to ${fileSize(maxBytes)} each. ` : ''}We read each file for its DOI or title and ask you to confirm the paper.</span>
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="sh-file-input"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            if (files.length) void start(files);
          }}
        />
      </label>

      {clouds.length > 0 && (
        <p className="sh-up-cloud small">
          {clouds.map((c) => {
            const { title, logo } = serviceFor(c, 'files');
            return c.connection?.status === 'ok' ? (
              <button key={c.name} type="button" className="btn btn-ghost btn-sm" onClick={() => fromCloud(c.name, title, logo)}>
                <Icon name="upload" /> Add from {title}
              </button>
            ) : (
              <a key={c.name} className="btn btn-ghost btn-sm" href={connectHref(c.name, '/app/shelf')}>
                {c.connection ? `Connect ${title} again` : `Connect ${title}`}
              </a>
            );
          })}
          <span>Choose PDFs (or Google Docs and Word files, as PDFs). On Google Drive, Citezeno only sees the files you choose.</span>
        </p>
      )}

      <ul className="sh-up-list">
        {rows.map((r) => (
          <li key={r.key} className={`sh-up-row is-${r.stage}`}>
            <div className="sh-up-head">
              <Icon name="pdf" />
              <span className="sh-up-name">{r.file.name}</span>
              {r.file.size != null && <span className="small">{fileSize(r.file.size)}</span>}
            </div>
            {(r.stage === 'starting' || r.stage === 'uploading' || r.stage === 'reading') && (
              <div className="sh-up-progress" role="status">
                <span className="sh-bar">
                  <i style={{ width: `${r.stage === 'reading' ? 100 : Math.round(r.progress * 100)}%` }} />
                </span>
                <span className="small">{r.stage === 'starting' ? 'Starting…' : r.stage === 'uploading' ? `Uploading ${Math.round(r.progress * 100)}%` : 'Reading the PDF…'}</span>
              </div>
            )}
            {r.stage === 'error' && (
              <div className="fp-error is-inline" role="alert">
                <Icon name="alert" />
                <p>{r.error?.message}</p>
                {r.error?.code === 'storage_full' && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={onManageFiles}>
                    Manage files
                  </button>
                )}
              </div>
            )}
            {r.stage === 'skipped' && <p className="small">Skipped: the file was removed.</p>}
            {r.stage === 'done' && r.item && (
              <p className="sh-up-done">
                <Icon name="check" /> Added as <b>{r.item.paper.title}</b>
                {r.result && (
                  <Link className="sh-up-open" href={readHref(r.item.paper.id, r.result.pdf.id)} prefetch={false}>
                    Open
                  </Link>
                )}
              </p>
            )}
            {r.stage === 'match' && r.result?.match && !r.manual && (
              <Matches
                result={r.result}
                busy={!!r.busy}
                onPick={(p: Paper) => confirm(r, { paperId: p.id })}
                onExisting={(itemId) => confirm(r, { itemId })}
                onManual={() => patch(r.key, { manual: true })}
                onKeep={() => confirm(r, { details: draftToInput(emptyDraft({ title: keepTitle(r) })) })}
                onSkip={() => skip(r)}
              />
            )}
            {r.stage === 'match' && r.result?.match && r.manual && (
              <ManualForm
                initial={emptyDraft({ title: r.result.match.found.title ?? r.file.name.replace(/\.pdf$/i, ''), doi: r.result.match.found.doi ?? '' })}
                submitLabel="Add with this PDF"
                onCancel={() => patch(r.key, { manual: false })}
                onSubmit={(details) => confirm(r, { details })}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Matches({
  result,
  busy,
  onPick,
  onExisting,
  onManual,
  onKeep,
  onSkip,
}: {
  result: CompleteResult;
  busy: boolean;
  onPick: (p: Paper) => void;
  onExisting: (itemId: string) => void;
  onManual: () => void;
  /* keep the PDF as the user's own document, titled from the PDF or its file name */
  onKeep: () => void;
  onSkip: () => void;
}) {
  const m = result.match!;
  const lead =
    m.matching === 'doi' && m.candidates.length
      ? `Found its DOI (${m.found.doi}). Is this the paper?`
      : m.candidates.length
        ? 'Matched by the title in the PDF. Pick the right paper:'
        : m.matching === 'unavailable'
          ? 'Paper lookup is unavailable right now. You can enter the details by hand.'
          : 'We couldn’t tell which paper this is. Enter the details by hand.';
  return (
    <div className="sh-matches">
      <p className="small">
        {lead}
        {result.pdf.textStatus === 'none' && ' This looks like a scanned PDF: its text isn’t available for search.'}
      </p>
      <ul className="sh-match-list">
        {m.candidates.map((p) => {
          const saved = m.saved[p.id];
          return (
            <li key={p.id} className="sh-match">
              <div>
                <b className="sh-match-title">{p.title}</b>
                <span className="sh-match-meta">{[authorsShort(p.authors, 2), p.year, p.source].filter(Boolean).join(' · ')}</span>
              </div>
              {saved ? (
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onExisting(saved)} title="It is already on your shelf: attach the PDF to it">
                  <Icon name="check" /> Attach to saved
                </button>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onPick(p)}>
                  <Icon name="plus" /> This one
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="sh-dup-actions">
        <button type="button" className="btn btn-ghost btn-sm sh-keep-doc" disabled={busy} onClick={onKeep} title="Not a published paper? Keep it in My uploads as your own document">
          <Icon name="pdf" /> Keep as my document
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onManual}>
          {m.candidates.length ? 'None of these: enter details' : 'Enter details by hand'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm sh-bulk-del" disabled={busy} onClick={onSkip}>
          Skip this file
        </button>
      </div>
    </div>
  );
}

/* The title for "Keep as my document": the one read from the PDF, else the file name. */
function keepTitle(r: Row): string {
  const found = r.result?.match?.found.title?.trim();
  return (found || r.file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim() || 'Untitled document').slice(0, 1000);
}
