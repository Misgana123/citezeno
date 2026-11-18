'use client';

import type { ShelfItem, Tag } from '@/lib/shelf/types';
import { READING_STATUSES, type ReadingStatus } from '@/lib/shelf/types';
import { Icon } from '../Icon';
import { authorsShort, citationLabel, doiHref, openalexHref, typeLabel } from '../papers/format';
import { STATUS_LABELS } from './shelf-state';

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
      <div className="fp-card-top">
        <label className="sh-pick" title="Select">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(item, e.target.checked, (e.nativeEvent as MouseEvent).shiftKey)}
            aria-label={`Select “${p.title}”`}
          />
        </label>
        <span className="tags">
          {p.isRetracted && (
            <span className="tag retracted fp-tag">
              <Icon name="alert" /> Retracted
            </span>
          )}
          {p.isOpenAccess && <span className="tag oa fp-tag">Open access</span>}
          {p.origin === 'manual' && <span className="tag fp-tag">Added manually</span>}
          {p.origin === 'import' && <span className="tag fp-tag">Imported</span>}
          {badges}
        </span>
        {p.origin === 'openalex' && (
          <span className="fp-cites" title="Times cited">
            {citationLabel(p.citedByCount)}
          </span>
        )}
      </div>
      <h3 className="fp-title">
        <button type="button" onClick={() => onOpen(item)} aria-haspopup="dialog">
          {p.title}
        </button>
      </h3>
      <p className="fp-authors">{authorsShort(p.authors)}</p>
      {meta.length > 0 && <p className="fp-meta">{meta.join(' · ')}</p>}
      {itemTags.length > 0 && (
        <p className="sh-card-tags">
          {itemTags.map((t) => (
            <span key={t.id}>#{t.name}</span>
          ))}
        </p>
      )}
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
          <select className="select sh-status" value={item.readingStatus} onChange={(e) => onStatus(item, e.target.value as ReadingStatus)} aria-label="Reading status">
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
