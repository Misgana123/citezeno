'use client';

import { useEffect, useRef } from 'react';

/* Draws a saffron thread from each citation marker in the paper to its source
   card, for the Claim Threads design. Must be the first child of .th-map.
   Works inside the scaled share preview too: positions are divided by the
   container's current scale. */
export function ThreadLines() {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = ref.current;
    const map = svg?.parentElement;
    if (!svg || !map) return;
    const NS = 'http://www.w3.org/2000/svg';

    const draw = () => {
      svg.replaceChildren();
      const box = map.getBoundingClientRect();
      const s = map.offsetWidth ? box.width / map.offsetWidth : 1;
      const paper = map.querySelector('.th-paper');
      if (!paper || map.offsetWidth < 900) return;
      const edge = (paper.getBoundingClientRect().right - box.left) / s;
      const seen = new Set<string>();
      map.querySelectorAll<HTMLElement>('.th-paper .cite[data-ref]').forEach((cite) => {
        const n = (cite.dataset.ref || '').split(' ')[0];
        if (!n || seen.has(n)) return;
        const card = map.querySelector<HTMLElement>(`[data-card][data-ref="${n}"]`);
        if (!card) return;
        seen.add(n);
        const a = cite.getBoundingClientRect();
        const b = card.getBoundingClientRect();
        const x1 = (a.right - box.left) / s + 4;
        const y1 = (a.top - box.top + a.height / 2) / s;
        const x2 = (b.left - box.left) / s;
        const y2 = (b.top - box.top) / s + 28;
        const w = Number(card.dataset.w) || 0.5;
        const sw = (0.8 + w * 2.6).toFixed(1);

        const lead = document.createElementNS(NS, 'path');
        lead.setAttribute('d', `M${x1},${y1} L${edge},${y1}`);
        lead.setAttribute('stroke-width', sw);
        lead.setAttribute('class', 'lead');
        lead.dataset.ref = n;
        const dx = (x2 - edge) * 0.55;
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', `M${edge},${y1} C${edge + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`);
        p.setAttribute('stroke-width', sw);
        p.dataset.ref = n;
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('cx', String(x2));
        c.setAttribute('cy', String(y2));
        c.setAttribute('r', '3.5');
        c.dataset.ref = n;
        svg.append(lead, p, c);
      });
    };

    let raf = 0;
    const queue = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    };
    draw();
    const ro = new ResizeObserver(queue);
    ro.observe(map);
    const scroller = map.closest('.shp-scroll') || window;
    scroller.addEventListener('scroll', queue, { passive: true });
    document.fonts?.ready.then(queue);
    const late = setTimeout(queue, 600);
    return () => {
      ro.disconnect();
      scroller.removeEventListener('scroll', queue);
      cancelAnimationFrame(raf);
      clearTimeout(late);
    };
  }, []);

  return <svg ref={ref} className="th-lines" aria-hidden="true" />;
}
