'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ReadingPosition } from '@/lib/reader/store/positions';
import { Icon } from '../Icon';
import { readHref } from './api';
import './read-button.css';

/* A row of the papers the user opened last in the reader, with the page they
   reached. Shown on the shelf and the home screen; hidden until there is one. */
export function ContinueReading({ limit = 4, className = '' }: { limit?: number; className?: string }) {
  const [papers, setPapers] = useState<ReadingPosition[] | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    fetch('/api/reader/recent', { cache: 'no-store', signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : { papers: [] }))
      .then((d: { papers: ReadingPosition[] }) => setPapers(d.papers ?? []))
      .catch(() => {});
    return () => ctl.abort();
  }, []);
  if (!papers?.length) return null;
  return (
    <section className={`rd-cont ${className}`.trim()} aria-label="Continue reading">
      <h3 className="rd-cont-h">
        <Icon name="book" /> Continue reading
      </h3>
      <ul className="rd-cont-list">
        {papers.slice(0, limit).map((p) => {
          const done = p.pageCount ? Math.min(1, p.page / p.pageCount) : 0;
          return (
            <li key={p.paperId}>
              <Link href={readHref(p.paperId)} prefetch={false} className="rd-cont-card">
                <span className="rd-cont-title">{p.title}</span>
                <span className="rd-cont-meta">{p.pageCount ? `Page ${p.page} of ${p.pageCount}` : `Page ${p.page}`}</span>
                <span className="rd-cont-bar" aria-hidden="true">
                  <i style={{ width: `${Math.round(done * 100)}%` }} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
