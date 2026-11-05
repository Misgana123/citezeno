'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/* A4 at 96 dpi with one-inch margins, like Word's print layout. */
const PAGE_W = 794;
const PAGE_H = 1123;
const MARGIN_Y = 96;
const CONTENT_H = PAGE_H - MARGIN_Y * 2 - 24; // leave room for the page number

/* Splits rendered manuscript HTML into page sheets and shows them in a scrollable viewer. */
export function PagedSheet({ html, label }: { html: string; label: string }) {
  const measure = useRef<HTMLDivElement>(null);
  const viewer = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<string[]>([html]);
  const [zoom, setZoom] = useState(1);
  const [current, setCurrent] = useState(1);

  const paginate = useCallback(() => {
    const m = measure.current;
    if (!m) return;
    m.innerHTML = html;
    const kids = [...m.children] as HTMLElement[];
    if (!kids.length) return setPages([html]);
    // group blocks that must stay together: a paragraph with its footnotes, a heading with what follows
    const groups: HTMLElement[][] = [];
    kids.forEach((el) => {
      const last = groups[groups.length - 1];
      const prev = last ? last[last.length - 1] : null;
      if (last && (el.classList.contains('fnotes') || (prev && prev.tagName === 'H3'))) last.push(el);
      else groups.push([el]);
    });
    const heightOf = (g: HTMLElement[]) => {
      const first = g[0];
      const lastEl = g[g.length - 1];
      const cs = getComputedStyle(lastEl);
      const top = first.offsetTop - parseFloat(getComputedStyle(first).marginTop || '0');
      return lastEl.offsetTop + lastEl.offsetHeight + parseFloat(cs.marginBottom || '0') - top;
    };
    const out: string[] = [];
    let cur = '';
    let used = 0;
    groups.forEach((g) => {
      const h = heightOf(g);
      // the reference list (and a Notes section) always starts on a fresh page
      const isSection = g[0].tagName === 'H3';
      if (used > 0 && (isSection || used + h > CONTENT_H)) {
        out.push(cur);
        cur = '';
        used = 0;
      }
      cur += g.map((e, k) => (k === 0 && isSection ? e.outerHTML.replace('class="list-title"', 'class="list-title first"') : e.outerHTML)).join('');
      used += h;
    });
    if (cur) out.push(cur);
    m.innerHTML = '';
    setPages(out.length ? out : [html]);
  }, [html]);

  useLayoutEffect(() => {
    paginate();
  }, [paginate]);

  useEffect(() => {
    document.fonts?.ready.then(paginate);
  }, [paginate]);

  /* fit the page to the column on narrower screens */
  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    const fit = () => setZoom(Math.min(1, (v.clientWidth - 48) / PAGE_W));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(v);
    return () => ro.disconnect();
  }, []);

  const onScroll = () => {
    const v = viewer.current;
    if (!v) return;
    const step = (PAGE_H + 24) * zoom;
    setCurrent(Math.min(pages.length, Math.floor((v.scrollTop + v.clientHeight * 0.35) / step) + 1));
  };

  return (
    <div className="pview">
      <div className="pview-bar">
        <span>
          Page <b>{current}</b> of <b>{pages.length}</b>
        </span>
        <span className="pview-note">{label}</span>
      </div>
      <div className="pview-scroll" ref={viewer} onScroll={onScroll}>
        <div className="pview-stack" style={{ zoom } as React.CSSProperties}>
          {pages.map((p, i) => (
            <div className="mpage" key={i} style={{ width: PAGE_W, minHeight: PAGE_H }}>
              <div className="mpage-body sheet sheet-flat" dangerouslySetInnerHTML={{ __html: p }} />
              <div className="mpage-num">{i + 1}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="mpage-measure sheet sheet-flat" ref={measure} aria-hidden="true" style={{ width: PAGE_W - 2 * 96 }} />
    </div>
  );
}
