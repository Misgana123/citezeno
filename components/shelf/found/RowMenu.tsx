'use client';

import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import { READING_STATUSES, type ReadingStatus, type ShelfItem } from '@/lib/shelf/types';
import { Icon } from '../../Icon';
import { doiHref } from '../../papers/format';
import { readHref } from '../../reader/api';
import { STATUS_LABELS } from '../shelf-state';
import { useDismiss } from '../useDismiss';

/* A paper's "…" menu: read it, open its details, set its status, open its
   DOI or link, or remove it from the shelf. */
export function RowMenu({ item, onOpen, onStatus, onRemove }: { item: ShelfItem; onOpen: (i: ShelfItem) => void; onStatus: (i: ShelfItem, s: ReadingStatus) => void; onRemove: (i: ShelfItem) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(box, open, close);
  const p = item.paper;
  const pdf = item.pdfs.at(-1);
  const hasPdf = !!pdf || !!p.pdfUrl;
  const link = p.doi ? { href: doiHref(p.doi), label: `DOI ${p.doi}` } : p.record ? { href: p.record.url, label: p.record.label } : p.landingUrl ? { href: p.landingUrl, label: 'Original page' } : null;
  const run = (f: () => void) => () => {
    setOpen(false);
    f();
  };
  return (
    <div className="sh-rowmenu" ref={box}>
      <button type="button" className="sh-dots" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={`Actions for “${p.title}”`}>
        <Icon name="dots" />
      </button>
      {open && (
        <div className="umenu-pop sh-rowmenu-pop" role="menu">
          <Link role="menuitem" href={readHref(p.id, pdf?.id)} prefetch={false} onClick={close}>
            <Icon name="book" /> {hasPdf ? 'Read' : 'Read abstract'}
          </Link>
          <button type="button" role="menuitem" onClick={run(() => onOpen(item))}>
            <Icon name="pencil" /> Details, tags and notes
          </button>
          {link && (
            <a role="menuitem" href={link.href} target="_blank" rel="noopener noreferrer" onClick={close}>
              <Icon name="external" /> <span className="sh-rowmenu-ell">{link.label}</span>
            </a>
          )}
          <span className="sh-rowmenu-h">Reading status</span>
          {READING_STATUSES.map((s) => (
            <button key={s} type="button" role="menuitemradio" aria-checked={item.readingStatus === s} onClick={run(() => onStatus(item, s))}>
              <Icon name={item.readingStatus === s ? 'check' : 'minus'} className={item.readingStatus === s ? '' : 'sh-rowmenu-off'} /> {STATUS_LABELS[s]}
            </button>
          ))}
          <hr />
          <button type="button" role="menuitem" className="is-danger" onClick={run(() => onRemove(item))}>
            <Icon name="trash" /> Remove from shelf
          </button>
        </div>
      )}
    </div>
  );
}
