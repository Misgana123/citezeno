'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/* Adds `is-in` to its element the first time it scrolls into view, so CSS can
   animate it (the amber thread in "four steps"). Without JavaScript, or with
   reduced motion, the CSS shows the finished state. */
export function InView({ as: Tag = 'div', className, children, threshold = 0.3 }: { as?: 'div' | 'ol'; className?: string; children: ReactNode; threshold?: number }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.add('is-armed');
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          el.classList.add('is-in');
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return (
    <Tag ref={ref as never} className={className}>
      {children}
    </Tag>
  );
}
