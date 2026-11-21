'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import type { ShelfItem } from '@/lib/shelf/types';
import { confirmDialog } from '../../confirm';
import { Icon } from '../../Icon';
import { readHref } from '../../reader/api';
import { toast } from '../../toast';
import { shelfFetch } from '../api';
import { fileSize, pdfHref, uploadPdf } from './upload';

/* The drawer's PDF section: the paper's PDFs (download, delete) and "Attach a PDF". */
export function PdfSection({ item, onChange }: { item: ShelfItem; onChange: (item: ShelfItem) => void }) {
  const [status, setStatus] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const attach = async (file: File) => {
    try {
      const r = await uploadPdf(file, { itemId: item.id, onStage: (s, p) => setStatus(s === 'uploading' ? `Uploading ${Math.round((p ?? 0) * 100)}%` : s === 'reading' ? 'Reading the PDF…' : 'Starting…') });
      if (r.item) onChange(r.item);
      toast(r.pdf.textStatus === 'none' ? 'PDF attached. It looks scanned, so its text isn’t searchable.' : 'PDF attached');
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setStatus(null);
    }
  };

  const remove = async (id: string, name: string) => {
    const ok = await confirmDialog({
      title: `Delete “${name}”?`,
      body: 'It’s removed from this paper and from your storage. The paper stays on your shelf.',
      confirmLabel: 'Delete PDF',
      danger: true,
    });
    if (!ok) return;
    try {
      await shelfFetch(pdfHref(id), { method: 'DELETE' });
      onChange({ ...item, pdfs: item.pdfs.filter((f) => f.id !== id) });
      toast('PDF deleted');
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  return (
    <section className="fp-detail-sec" aria-labelledby="sh-pdf-h">
      <h3 id="sh-pdf-h">Your PDF</h3>
      {item.pdfs.length > 0 && (
        <ul className="sh-pdfs">
          {item.pdfs.map((f) => (
            <li key={f.id}>
              <Icon name="pdf" />
              <span className="sh-pdf-name">
                <Link href={readHref(item.paper.id, f.id)} prefetch={false} title="Read it">
                  {f.fileName}
                </Link>
                <span className="small">
                  {[fileSize(f.sizeBytes), f.pageCount && `${f.pageCount} pages`, f.textStatus === 'none' && 'text not available for search'].filter(Boolean).join(' · ')}
                </span>
              </span>
              <a className="icon-btn sh-remove" href={pdfHref(f.id)} target="_blank" rel="noopener noreferrer" aria-label={`Download ${f.fileName}`} title="Download">
                <Icon name="download" />
              </a>
              <button type="button" className="icon-btn sh-remove" onClick={() => remove(f.id, f.fileName)} aria-label={`Delete ${f.fileName}`} title="Delete">
                <Icon name="trash" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="sh-pdf-attach">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => input.current?.click()} disabled={!!status}>
          {status ? <span className="spin" aria-hidden="true" /> : <Icon name="upload" />} {status ?? (item.pdfs.length ? 'Attach another PDF' : 'Attach a PDF')}
        </button>
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          className="sh-file-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void attach(f);
          }}
        />
      </div>
    </section>
  );
}
