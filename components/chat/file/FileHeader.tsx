'use client';

import { useRef, useState } from 'react';
import type { ReaderData } from '../../reader/api';
import { readHref } from '../../reader/api';
import { originalHref } from '../../reader/Details';
import { Icon, type IconName } from '../../Icon';
import { authorsShort } from '../../papers/format';
import { shelfFetch } from '../../shelf/api';
import { markSaved } from '../../shelf/saved-store';
import { useDismiss } from '../../shelf/useDismiss';
import { toast } from '../../toast';
import { referenceText } from './citation';

/* The open file's header: what it is (title, authors, journal, year, pages,
   whether it's on the shelf) and what can be done with it: download, open in
   the full reader, more (save, copy the citation or a link, open the PDF in a
   new tab, details), and close. */

type Item = { label: string; icon: IconName; onClick?(): void; href?: string; hint?: string } | null;

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    toast('Couldn’t copy. Your browser blocked it.', true);
  }
}

export function FileHeader({
  data,
  pages,
  details,
  onDetails,
  onSaved,
  onClose,
}: {
  data: ReaderData | null;
  pages: number | null;
  details: boolean;
  onDetails(): void;
  onSaved(itemId: string): void;
  onClose(): void;
}) {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, menu, () => setMenu(false));
  const p = data?.paper;
  const pdfUrl = data && data.pdf.kind !== 'none' ? data.pdf.url : null;
  const readerLink = p ? readHref(p.id) : null;

  const save = async () => {
    if (!p) return;
    try {
      const r = await shelfFetch<{ item: { id: string } }>('/api/shelf/papers', { method: 'POST', body: { via: 'search', paperId: p.id } });
      markSaved(p.id, r.item.id);
      onSaved(r.item.id);
      toast('Saved to your shelf');
    } catch (e) {
      const err = e as { code?: string; itemId?: string; message?: string };
      if (err.code === 'duplicate' && err.itemId) {
        markSaved(p.id, err.itemId);
        onSaved(err.itemId);
        toast('Already on your shelf');
      } else toast(err.message || 'Couldn’t save this paper.', true);
    }
  };

  const items: Item[] = p
    ? [
        data!.shelf ? null : { label: 'Save to shelf', icon: 'plus', onClick: save },
        { label: 'Copy citation', icon: 'quote', hint: 'APA', onClick: async () => copy(await referenceText(p), 'Citation copied (APA 7)') },
        readerLink ? { label: 'Copy link', icon: 'link', onClick: () => copy(new URL(readerLink, window.location.origin).href, 'Link copied') } : null,
        pdfUrl ? { label: 'Open PDF in a new tab', icon: 'external', href: pdfUrl } : null,
        originalHref(data!) ? { label: 'Open original', icon: 'globe', href: originalHref(data!)! } : null,
        { label: details ? 'Hide details' : 'Paper details', icon: 'doc', onClick: onDetails },
      ]
    : [];

  const meta = p ? [authorsShort(p.authors), p.source, p.year, pages ? `${pages} page${pages === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ') : '';

  return (
    <header className="cf-head">
      <span className={`cf-badge${pdfUrl ? '' : ' is-abs'}`} aria-hidden="true">
        {pdfUrl ? 'PDF' : 'ABS'}
      </span>
      <div className="cf-head-txt">
        {p ? (
          <>
            <h2 className="cf-title" title={p.title}>
              {p.title}
            </h2>
            <p className="cf-meta">
              {meta}
              {data!.shelf && (
                <>
                  {meta && ' · '}
                  <span className="cf-saved">On your shelf</span>
                </>
              )}
              {p.isRetracted && <span className="ch-flag">Retracted</span>}
            </p>
          </>
        ) : (
          <>
            <span className="rd-skel" style={{ width: '70%', height: 15 }} />
            <span className="rd-skel" style={{ width: '45%', height: 11, marginTop: 6 }} />
          </>
        )}
      </div>
      <div className="cf-head-acts">
        {pdfUrl && (
          <a
            className="cf-ib"
            href={pdfUrl}
            download={data!.pdf.kind !== 'none' ? (data!.pdf.fileName ?? undefined) : undefined}
            target="_blank"
            rel="noopener noreferrer"
            title="Download"
            aria-label="Download the PDF"
          >
            <Icon name="download" />
          </a>
        )}
        {readerLink && (
          <a className="cf-ib" href={readerLink} title="Open in the reader" aria-label="Open in the full reader">
            <Icon name="expand" />
          </a>
        )}
        <div className="cf-menu-wrap" ref={ref}>
          <button type="button" className="cf-ib" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu} aria-label="More" title="More" disabled={!p}>
            <Icon name="dots" />
          </button>
          {menu && (
            <div className="cf-menu" role="menu">
              {items.filter(Boolean).map((it) =>
                it!.href ? (
                  <a key={it!.label} role="menuitem" href={it!.href} target="_blank" rel="noopener noreferrer" onClick={() => setMenu(false)}>
                    <Icon name={it!.icon} /> {it!.label}
                  </a>
                ) : (
                  <button
                    key={it!.label}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      it!.onClick?.();
                    }}
                  >
                    <Icon name={it!.icon} /> {it!.label}
                    {it!.hint && <kbd>{it!.hint}</kbd>}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
        <span className="cf-sep" aria-hidden="true" />
        <button type="button" className="cf-ib" onClick={onClose} title="Close (Esc)" aria-label="Close the file">
          <Icon name="x" />
        </button>
      </div>
    </header>
  );
}
