'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { PdfRow } from '@/lib/shelf/store/pdfs';
import { confirmDialog } from '../../confirm';
import { Icon } from '../../Icon';
import { readHref } from '../../reader/api';
import { toast } from '../../toast';
import { shelfFetch } from '../api';
import { fileSize, pdfHref } from './upload';

type Files = { files: (PdfRow & { paperTitle: string | null; paperId: string | null })[]; usedBytes: number; limitBytes: number; enabled: boolean };

/* Every uploaded PDF and the storage they take, to free up space. */
export function FilesDialog({ onClose, onDeleted }: { onClose: () => void; onDeleted: () => void }) {
  const [data, setData] = useState<Files | null>(null);
  const load = useCallback(() => {
    shelfFetch<Files>('/api/shelf/pdfs')
      .then(setData)
      .catch((e) => toast((e as Error).message, true));
  }, []);
  useEffect(() => {
    load();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [load, onClose]);

  const remove = async (f: Files['files'][number]) => {
    const ok = await confirmDialog({
      title: `Delete “${f.fileName}”?`,
      body: f.paperTitle ? `It’s removed from your storage and from “${f.paperTitle}”. The paper stays on your shelf.` : 'It’s removed from your storage.',
      confirmLabel: 'Delete PDF',
      danger: true,
    });
    if (!ok) return;
    try {
      await shelfFetch(pdfHref(f.id), { method: 'DELETE' });
      load();
      onDeleted();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  const pct = data ? Math.min(100, (data.usedBytes / data.limitBytes) * 100) : 0;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog sh-add-dialog" role="dialog" aria-modal="true" aria-labelledby="sh-files-h">
        <div className="sh-add-head">
          <h2 id="sh-files-h">Your PDFs</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        {!data ? (
          <div className="hist-loading fp-skel" />
        ) : (
          <>
            <div className="sh-usage">
              <span className="sh-bar">
                <i style={{ width: `${pct}%` }} className={pct > 90 ? 'is-full' : undefined} />
              </span>
              <span className="small">
                {fileSize(data.usedBytes)} of {fileSize(data.limitBytes)} used
              </span>
            </div>
            {!data.files.length ? (
              <p className="sh-hint">No PDFs yet. Upload them from “Add papers”, or attach one to a paper.</p>
            ) : (
              <ul className="sh-pdfs sh-files">
                {data.files.map((f) => (
                  <li key={f.id}>
                    <Icon name="pdf" />
                    <span className="sh-pdf-name">
                      {f.paperId ? (
                        <Link href={readHref(f.paperId, f.id)} prefetch={false} title="Read it">
                          {f.fileName}
                        </Link>
                      ) : (
                        <a href={pdfHref(f.id)} target="_blank" rel="noopener noreferrer">
                          {f.fileName}
                        </a>
                      )}
                      <span className="small">{[fileSize(f.sizeBytes), f.paperTitle ?? 'not matched to a paper yet'].join(' · ')}</span>
                    </span>
                    <a className="icon-btn sh-remove" href={pdfHref(f.id)} target="_blank" rel="noopener noreferrer" aria-label={`Download ${f.fileName}`} title="Download">
                      <Icon name="download" />
                    </a>
                    <button type="button" className="icon-btn sh-remove" onClick={() => remove(f)} aria-label={`Delete ${f.fileName}`} title="Delete">
                      <Icon name="trash" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
