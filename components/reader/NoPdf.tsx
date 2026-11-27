'use client';

import { Icon } from '../Icon';
import type { ReaderData } from './api';
import { Details, originalHref } from './Details';

/* No PDF to show: the details and abstract, Open original and Upload PDF. */
export function NoPdf({ data, onUpload, onRetry, uploading }: { data: ReaderData; onUpload(): void; onRetry(): void; uploading: number | null }) {
  const failed = data.pdf.kind === 'none' && data.pdf.reason === 'download_failed';
  const storageOff = data.pdf.kind === 'none' && data.pdf.reason === 'storage_off';
  const href = originalHref(data);
  return (
    <div className="rd-nopdf">
      <div className="rd-nopdf-card">
        <div className={`rd-nopdf-note${failed ? ' is-warn' : ''}`}>
          <Icon name={failed ? 'alert' : 'pdf'} />
          <div>
            <b>{failed ? 'We couldn’t load the free PDF.' : storageOff ? 'PDF storage isn’t set up yet.' : 'There’s no free PDF for this paper.'}</b>
            <p>
              {failed
                ? 'The link may be broken, or the site may ask you to sign in. You can open the original, or upload your own copy.'
                : 'Read the details and abstract here, open the publisher’s page, or upload your own copy to read and annotate it.'}
            </p>
          </div>
        </div>
        <div className="rd-nopdf-acts">
          <button type="button" className="btn btn-thread" onClick={onUpload} disabled={uploading != null || storageOff}>
            {uploading != null ? <span className="spin" aria-hidden="true" /> : <Icon name="upload" />} {uploading != null ? `Uploading… ${Math.round(uploading * 100)}%` : 'Upload PDF'}
          </button>
          {href && (
            <a className="btn btn-ghost" href={href} target="_blank" rel="noopener noreferrer">
              <Icon name="external" /> Open original
            </a>
          )}
          {failed && (
            <button type="button" className="btn btn-ghost" onClick={onRetry}>
              <Icon name="undo" /> Try again
            </button>
          )}
        </div>
        <Details data={data} />
      </div>
    </div>
  );
}
