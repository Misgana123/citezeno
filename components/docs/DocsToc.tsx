'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';

/* "On this page": follows the section being read and shows how much of the article is read. */
export function DocsToc({ headings }: { headings: { id: string; text: string; sub: boolean }[] }) {
  const [cur, setCur] = useState(headings[0]?.id);
  const [read, setRead] = useState(0);
  const [bar, setBar] = useState({ top: 4, h: 28 });
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const sync = () => {
      let c = headings[0]?.id;
      for (const h of headings) {
        const el = document.getElementById(h.id);
        if (el && el.getBoundingClientRect().top < 160) c = h.id;
      }
      setCur(c);
      const main = document.querySelector('.dk-main');
      if (main) {
        const r = main.getBoundingClientRect();
        setRead(Math.max(0, Math.min(1, (innerHeight - r.top) / r.height)));
      }
    };
    sync();
    addEventListener('scroll', sync, { passive: true });
    addEventListener('resize', sync);
    return () => {
      removeEventListener('scroll', sync);
      removeEventListener('resize', sync);
    };
  }, [headings]);

  useEffect(() => {
    const a = list.current?.querySelector<HTMLAnchorElement>(`a[href="#${cur}"]`);
    if (a) setBar({ top: a.offsetTop, h: a.offsetHeight });
  }, [cur]);

  return (
    <aside className="dk-toc" aria-label="On this page">
      {headings.length > 0 && <b>On this page</b>}
      <ol hidden={headings.length === 0} ref={list} style={{ ['--bar-top' as string]: `${bar.top}px`, ['--bar-h' as string]: `${bar.h}px` }}>
        {headings.map((h) => (
          <li key={h.id}>
            <a href={`#${h.id}`} className={`${h.sub ? 'sub' : ''} ${h.id === cur ? 'on' : ''}`.trim() || undefined}>
              {h.text}
            </a>
          </li>
        ))}
      </ol>
      <div className="dk-toc-prog">
        <svg viewBox="0 0 36 36" aria-hidden="true">
          <circle cx="18" cy="18" r="15" fill="none" stroke="var(--rule-2)" strokeWidth="3" />
          <circle cx="18" cy="18" r="15" fill="none" stroke="var(--thread)" strokeWidth="3" strokeLinecap="round" strokeDasharray="94.2" strokeDashoffset={94.2 * (1 - read)} />
        </svg>
        <span>{Math.round(read * 100)}% read</span>
      </div>
      <div className="dk-toc-actions">
        <Link href="/contact">
          <Icon name="pencil" className="ic" />
          Suggest an edit
        </Link>
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <Icon name="arrow" className="ic up" />
          Back to top
        </a>
      </div>
    </aside>
  );
}
