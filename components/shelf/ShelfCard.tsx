'use client';

import type { ShelfItem, Tag } from '@/lib/shelf/types';
import { READING_STATUSES, type ReadingStatus } from '@/lib/shelf/types';
import { Icon } from '../Icon';
import { authorsShort, citationLabel, doiHref, typeLabel } from '../papers/format';
import { STATUS_LABELS } from './shelf-state';
import { Select } from '../Select';

/* One paper on the shelf: select it, open it in the drawer, set its status or remove it. */
export function ShelfCard({
  item,
  tags,
  active = false,
  selected,
  onSelect,
  onOpen,
  onStatus,
  onRemove,
  badges,
}: {
  item: ShelfItem;
  tags: Map<string, Tag>;
  active?: boolean;
  selected: boolean;
  onSelect: (item: ShelfItem, on: boolean, shift: boolean) => void;
  onOpen: (item: ShelfItem) => void;
  onStatus: (item: ShelfItem, status: ReadingStatus) => void;
  onRemove: (item: ShelfItem) => void;
  /* labels added by later features (PDF) */
  badges?: React.ReactNode;
}) {
  const p = item.paper;
  const meta = [p.year, p.source, typeLabel(p.type)].filter(Boolean);
  const itemTags = item.tagIds.map((id) => tags.get(id)).filter((t): t is Tag => !!t);
  return (
    <li id={`item-${item.id}`} className={`fp-card sh-card${p.isRetracted ? ' is-retracted' : ''}${active ? ' is-active' : ''}${selected ? ' is-selected' : ''}`}>
      <label className="sh-pick" title="Select">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(item, e.target.checked, (e.nativeEvent as MouseEvent).shiftKey)}
          aria-label={`Select “${p.title}”`}
        />
      </label>
      <div className="sh-card-main">
        <h3 className="fp-title">
          <button type="button" onClick={() => onOpen(item)} aria-haspopup="dialog">
            {p.title}
          </button>
        </h3>
        <p className="fp-authors">{authorsShort(p.authors)}</p>
        {meta.length > 0 && <p className="fp-meta">{meta.join(' · ')}</p>}
        <div className="sh-card-line">
          <span className="tags">
            {p.isRetracted && (
              <span className="tag retracted fp-tag">
                <Icon name="alert" /> Retracted
              </span>
            )}
            {p.isOpenAccess && <span className="tag oa fp-tag">Open access</span>}
            {p.origin === 'manual' && <span className="tag fp-tag">Added manually</span>}
            {p.origin === 'import' && <span className="tag fp-tag">Imported</span>}
            {item.pdfs.length > 0 && (
              <span className="tag fp-tag" title={item.pdfs.some((f) => f.textStatus === 'none') ? 'Your PDF (scanned: text not available for search)' : 'Your PDF'}>
                <Icon name="pdf" /> PDF
              </span>
            )}
            {badges}
          </span>
          {itemTags.map((t) => (
            <span key={t.id} className="sh-tag">
              #{t.name}
            </span>
          ))}
        </div>
        {item.note && <p className="sh-note">{item.note}</p>}
        <span className="fp-links">
          {p.doi && (
            <a href={doiHref(p.doi)} target="_blank" rel="noopener noreferrer">
              <Icon name="external" /> DOI {p.doi}
            </a>
          )}
          {!p.doi && p.record && (
            <a href={p.record.url} target="_blank" rel="noopener noreferrer">
              <Icon name="external" /> {p.record.label}
            </a>
          )}
          {!p.doi && !p.record && p.landingUrl && (
            <a href={p.landingUrl} target="_blank" rel="noopener noreferrer">
              <Icon name="external" /> Link
            </a>
          )}
        </span>
      </div>
      <div className="sh-card-side">
        <span className="sh-card-tools">
          <Select<ReadingStatus>
            className={`select sh-status is-${item.readingStatus}`}
            value={item.readingStatus}
            onChange={(s) => onStatus(item, s)}
            aria-label="Reading status"
            options={READING_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
          />
          <button type="button" className="icon-btn sh-remove" onClick={() => onRemove(item)} aria-label={`Remove “${p.title}” from your shelf`} title="Remove from shelf">
            <Icon name="trash" />
          </button>
        </span>
        {p.origin === 'provider' && (
          <span className="fp-cites" title="Times cited">
            {citationLabel(p.citedByCount)}
          </span>
        )}
      </div>
    </li>
  );
}
