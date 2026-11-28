'use client';

import Link from 'next/link';
import type { ReadingStatus, ShelfItem, Tag } from '@/lib/shelf/types';
import { Icon } from '../../Icon';
import { authorsShort, citationLabel } from '../../papers/format';
import { readHref } from '../../reader/api';
import { STATUS_LABELS } from '../shelf-state';
import { RowMenu } from './RowMenu';
import { shelfSpace } from '../api';

export type RowProps = {
  item: ShelfItem;
  tags: Map<string, Tag>;
  active: boolean;
  selected: boolean;
  /* just added: highlighted once */
  fresh: boolean;
  onSelect: (item: ShelfItem, on: boolean, shift: boolean) => void;
  onOpen: (item: ShelfItem) => void;
  onStatus: (item: ShelfItem, status: ReadingStatus) => void;
  onRemove: (item: ShelfItem) => void;
};

/* One paper in the Library table: title and authors, year, where it was
   published, access, and its "…" menu. The title opens the details drawer. */
export function FoundRow({ item, tags, active, selected, fresh, onSelect, onOpen, onStatus, onRemove }: RowProps) {
  const p = item.paper;
  const pdf = item.pdfs.at(-1);
  const meta = [p.authors.length ? authorsShort(p.authors) : null, p.origin === 'provider' ? citationLabel(p.citedByCount) : p.origin === 'manual' ? 'Added by hand' : 'Imported'].filter(Boolean);
  const itemTags = item.tagIds.map((id) => tags.get(id)).filter((t): t is Tag => !!t);
  return (
    <li id={`item-${item.id}`} className={`sh-tr${active ? ' is-active' : ''}${selected ? ' is-selected' : ''}${fresh ? ' is-fresh' : ''}${p.isRetracted ? ' is-retracted' : ''}`}>
      <label className="sh-tr-pick" title="Select">
        <input type="checkbox" checked={selected} onChange={(e) => onSelect(item, e.target.checked, (e.nativeEvent as MouseEvent).shiftKey)} aria-label={`Select “${p.title}”`} />
      </label>
      <div className="sh-tr-title">
        <h3>
          <button type="button" onClick={() => onOpen(item)} aria-haspopup="dialog">
            {p.title}
          </button>
        </h3>
        <p className="sh-tr-meta">{meta.join(' · ')}</p>
        {itemTags.length > 0 && (
          <span className="sh-tr-tags">
            {itemTags.map((t) => (
              <span key={t.id} className="sh-tag">
                #{t.name}
              </span>
            ))}
          </span>
        )}
      </div>
      <span className="sh-tr-year">{p.year ?? '—'}</span>
      <span className="sh-tr-src">{p.source ?? '—'}</span>
      <span className="sh-tr-access">
        {p.isRetracted && (
          <span className="sh-chip is-warn">
            <Icon name="alert" /> Retracted
          </span>
        )}
        {p.origin === 'provider' &&
          (p.isOpenAccess ? (
            <span className="sh-chip is-oa">
              <Icon name="unlock" /> Open
            </span>
          ) : (
            <span className="sh-chip is-line">Paywalled</span>
          ))}
        {pdf && (
          <Link className="sh-chip is-mine" href={readHref(p.id, pdf.id, shelfSpace())} prefetch={false} title="Read your PDF">
            <Icon name="file" /> Your PDF
          </Link>
        )}
        {item.readingStatus !== 'to_read' && <span className={`sh-chip is-status is-${item.readingStatus}`}>{STATUS_LABELS[item.readingStatus]}</span>}
      </span>
      <RowMenu item={item} onOpen={onOpen} onStatus={onStatus} onRemove={onRemove} />
    </li>
  );
}
