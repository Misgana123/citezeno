'use client';

import type { ShelfItem } from '@/lib/shelf/types';
import { READING_STATUSES, type ReadingStatus } from '@/lib/shelf/types';
import { Icon } from '../Icon';
import { authorsShort, citationLabel, doiHref, openalexHref, typeLabel } from '../papers/format';
import { STATUS_LABELS } from './shelf-state';

/* One paper on the shelf. */
export function ShelfCard({
  item,
  active = false,
  onStatus,
  onRemove,
}: {
  item: ShelfItem;
  active?: boolean;
  onStatus: (item: ShelfItem, status: ReadingStatus) => void;
  onRemove: (item: ShelfItem) => void;
}) {
  const p = item.paper;
  const meta = [p.year, p.source, typeLabel(p.type)].filter(Boolean);
  return (
    <li id={`item-${item.id}`} className={`fp-card sh-card${p.isRetracted ? ' is-retracted' : ''}${active ? ' is-active' : ''}`}>
      <div className="fp-card-top">
        <span className="tags">
          {p.isRetracted && (
            <span className="tag retracted fp-tag">
              <Icon name="alert" /> Retracted
            </span>
          )}
          {p.isOpenAccess && <span className="tag oa fp-tag">Open access</span>}
          {p.origin === 'manual' && <span className="tag fp-tag">Added manually</span>}
        </span>
        <span className="fp-cites" title="Times cited">
          {citationLabel(p.citedByCount)}
        </span>
      </div>
      <h3 className="fp-title">
        <span>{p.title}</span>
      </h3>
      <p className="fp-authors">{authorsShort(p.authors)}</p>
      {meta.length > 0 && <p className="fp-meta">{meta.join(' · ')}</p>}
      {item.note && <p className="sh-note">{item.note}</p>}
      <div className="fp-card-actions">
        <span className="fp-links">
          {p.doi && (
            <a href={doiHref(p.doi)} target="_blank" rel="noopener noreferrer">
              <Icon name="external" /> DOI {p.doi}
            </a>
          )}
          {!p.doi && p.openalexId && (
            <a href={openalexHref(p.openalexId)} target="_blank" rel="noopener noreferrer">
              <Icon name="external" /> OpenAlex
            </a>
          )}
          {!p.doi && !p.openalexId && p.landingUrl && (
            <a href={p.landingUrl} target="_blank" rel="noopener noreferrer">
              <Icon name="external" /> Link
            </a>
          )}
        </span>
        <span className="sh-card-tools">
          <select
            className="select sh-status"
            value={item.readingStatus}
            onChange={(e) => onStatus(item, e.target.value as ReadingStatus)}
            aria-label="Reading status"
          >
            {READING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <button type="button" className="icon-btn sh-remove" onClick={() => onRemove(item)} aria-label={`Remove “${p.title}” from your shelf`} title="Remove from shelf">
            <Icon name="trash" />
          </button>
        </span>
      </div>
    </li>
  );
}
