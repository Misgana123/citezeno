'use client';

import { useEffect, useRef, type HTMLAttributes, type ReactNode } from 'react';

/* Ties citation markers, notes, reference entries and source cards together:
   hovering any of them lights the others that share a data-ref, and clicking
   a marker scrolls to its source card. One listener for the whole page. */
export function LinkHighlights({ children, ...rest }: { children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const refsOf = (el: Element) => (el.getAttribute('data-ref') || '').split(/\s+/).filter(Boolean);
    let lit: Element[] = [];
    const clear = () => {
      lit.forEach((e) => e.classList.remove('lit'));
      lit = [];
    };
    const target = (e: Event) => {
      const el = e.target as Element | null;
      const t = el && typeof el.closest === 'function' ? el.closest('[data-ref]') : null;
      return t && root.contains(t) ? t : null;
    };
    const over = (e: Event) => {
      const t = target(e);
      if (!t) return;
      clear();
      const want = new Set(refsOf(t));
      root.querySelectorAll('[data-ref]').forEach((el) => {
        if (refsOf(el).some((r) => want.has(r))) {
          el.classList.add('lit');
          lit.push(el);
        }
      });
    };
    const out = (e: Event) => target(e) && clear();
    const click = (e: Event) => {
      const el = e.target as Element | null;
      const cite = el && typeof el.closest === 'function' ? el.closest('.cite[data-ref]') : null;
      if (!cite || root.closest('.shp')) return;
      const n = refsOf(cite)[0];
      root.querySelector(`[data-card][data-ref="${n}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    root.addEventListener('mouseover', over);
    root.addEventListener('mouseout', out);
    root.addEventListener('click', click);
    return () => {
      root.removeEventListener('mouseover', over);
      root.removeEventListener('mouseout', out);
      root.removeEventListener('click', click);
    };
  }, []);

  return (
    <div ref={ref} {...rest}>
      {children}
    </div>
  );
}
