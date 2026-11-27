'use client';

import { Icon } from '../Icon';
import { fileBadge } from './attach';

/* A file added to a message, as a small square card: a picture of it (an
   image, a screenshot or a PDF's first page) or the start of its text, with
   its type in the corner ("PDF", "MD"). Pictures carry no type. Used in the
   message box (with ×) and on sent messages. */

export type CardFile = { name: string; kind?: 'text' | 'image'; status?: 'reading' | 'ready' | 'error'; preview?: string; excerpt?: string; error?: string };

export function AttachCard({ file: f, onRemove }: { file: CardFile; onRemove?(): void }) {
  const status = f.status ?? 'ready';
  const label = status === 'reading' ? `${f.name} (reading…)` : status === 'error' ? `${f.name}: ${f.error}` : f.name;
  return (
    <li className={`ch-card is-${status}${f.kind === 'image' ? ' is-pic' : ''}`} title={label}>
      {status === 'reading' ? (
        <span className="ch-card-wait">
          <span className="ch-card-spin" />
          <span className="ch-card-name">{f.name}</span>
        </span>
      ) : status === 'error' ? (
        <span className="ch-card-err">
          <Icon name="alert" />
          <span>{f.error}</span>
        </span>
      ) : f.preview ? (
        <img className="ch-card-pic" src={f.preview} alt={f.name} />
      ) : (
        <span className="ch-card-text">
          <b>{f.name}</b>
          {f.excerpt}
        </span>
      )}
      {status !== 'error' && f.kind !== 'image' && <span className="ch-card-badge">{fileBadge(f.name)}</span>}
      {onRemove && (
        <button type="button" className="ch-card-x" onClick={onRemove} aria-label={`Remove ${f.name}`} title="Remove">
          <Icon name="x" />
        </button>
      )}
    </li>
  );
}
