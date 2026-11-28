'use client';

import Link from 'next/link';
import type { ShelfItem } from '@/lib/shelf/types';
import { Icon } from '../../Icon';
import { readHref } from '../../reader/api';
import { UploadCover } from './UploadCover';
import { tileInfo } from './tile-info';
import { shelfSpace } from '../api';

/* One upload in the gallery: the cover opens it in the reader, the title opens
   its details (tags, notes, status, remove), and the box selects it. */
export function UploadTile({
  item,
  active,
  selected,
  fresh,
  onSelect,
  onOpen,
}: {
  item: ShelfItem;
  active: boolean;
  selected: boolean;
  /* just added: highlighted once */
  fresh: boolean;
  onSelect: (item: ShelfItem, on: boolean, shift: boolean) => void;
  onOpen: (item: ShelfItem) => void;
}) {
  const p = item.paper;
  const t = tileInfo(item);
  return (
    <li id={`item-${item.id}`} className={`sh-tile${active ? ' is-active' : ''}${selected ? ' is-selected' : ''}${fresh ? ' is-fresh' : ''}${p.isRetracted ? ' is-retracted' : ''}`}>
      <div className="sh-tile-frame">
        <Link href={readHref(p.id, t.pdfId, shelfSpace())} prefetch={false} className="sh-tile-read" aria-label={`${t.action} “${p.title}”`} title={t.where ?? undefined}>
          <UploadCover title={p.title} progress={t.progress} />
          <span className="sh-tile-hover">
            <span className="btn btn-thread btn-sm">
              <Icon name="book" /> {t.action}
            </span>
          </span>
        </Link>
        <label className="sh-pick sh-tile-pick" title="Select">
          <input type="checkbox" checked={selected} onChange={(e) => onSelect(item, e.target.checked, (e.nativeEvent as MouseEvent).shiftKey)} aria-label={`Select “${p.title}”`} />
        </label>
      </div>
      <div className="sh-tile-body">
        <h3>
          <button type="button" onClick={() => onOpen(item)} aria-haspopup="dialog">
            {p.title}
          </button>
        </h3>
        <p className="sh-tile-meta">{t.meta}</p>
        <span className="sh-tile-chips">
          {p.isRetracted && (
            <span className="tag retracted fp-tag">
              <Icon name="alert" /> Retracted
            </span>
          )}
          {t.match ? (
            <span className="sh-chip-line" title={t.match}>
              <Icon name="check" />
              <span>{t.match}</span>
            </span>
          ) : (
            <span className="sh-chip-doc">Your document</span>
          )}
        </span>
      </div>
    </li>
  );
}
