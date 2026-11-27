'use client';

import Link from 'next/link';
import { Icon } from '../Icon';
import { readHref } from './api';
import './read-button.css';

/* Open a paper in the reader, from anywhere (Find Papers, the shelf, the
   assistant). A plain link: same tab, and Ctrl/middle-click opens a new one.
   Papers without a PDF still open, showing the details and abstract. */
export function ReadButton({
  paperId,
  hasPdf,
  pdfId,
  chatId,
  main = false,
  className = '',
  onOpen,
  open = false,
}: {
  paperId: string;
  hasPdf: boolean;
  /* one of the user's own PDFs of the paper */
  pdfId?: string | null;
  /* the assistant's conversation, continued in the reader's side panel */
  chatId?: string | null;
  /* the main button where it appears */
  main?: boolean;
  className?: string;
  /* open it in place instead (the assistant's file panel); Ctrl/⌘ or middle click still opens the reader */
  onOpen?(): void;
  /* it's the file shown in that panel */
  open?: boolean;
}) {
  return (
    <Link
      className={`btn ${main ? 'btn-thread' : 'btn-ghost'} btn-sm rd-read-btn${open ? ' is-open' : ''} ${className}`.trim()}
      href={`${readHref(paperId, pdfId)}${chatId ? `${pdfId ? '&' : '?'}chat=${encodeURIComponent(chatId)}` : ''}`}
      prefetch={false}
      aria-pressed={onOpen ? open : undefined}
      onClick={(e) => {
        if (!onOpen || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onOpen();
      }}
    >
      <Icon name="book" /> {open ? 'Open' : hasPdf ? 'Read' : 'Read abstract'}
    </Link>
  );
}
