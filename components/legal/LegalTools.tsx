'use client';

import { useEffect, useState } from 'react';

/* "On this page": the section in view is highlighted as you scroll. */
export function LegalToc({ items }: { items: [id: string, label: string][] }) {
  const [on, setOn] = useState(items[0]?.[0]);
  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setOn(e.target.id)),
      { rootMargin: '-30% 0px -60% 0px' },
    );
    items.forEach(([id]) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [items]);
  return (
    <nav className="lg-toc" aria-label="On this page">
      <small>On this page</small>
      {items.map(([id, label], i) => (
        <a key={id} href={`#${id}`} aria-current={on === id ? 'location' : undefined}>
          <span>{String(i + 1).padStart(2, '0')}</span>
          {label}
        </a>
      ))}
    </nav>
  );
}
