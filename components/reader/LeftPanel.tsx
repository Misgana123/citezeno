'use client';

import { useEffect, useRef, useState } from 'react';
import type { OutlineItem, PdfControls } from './pdf/PdfPane';

/* Page thumbnails and the table of contents (the PDF's bookmarks, when it has them). */
export function LeftPanel({ pdf, page, tab, onTab }: { pdf: PdfControls | null; page: number; tab: 'pages' | 'contents'; onTab(t: 'pages' | 'contents'): void }) {
  const [outline, setOutline] = useState<OutlineItem[] | null>(null);
  useEffect(() => {
    setOutline(null);
    if (pdf) pdf.outline().then(setOutline, () => setOutline([]));
  }, [pdf]);

  return (
    <aside className="rd-left" aria-label="Pages and contents">
      <div className="rd-left-tabs seg" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'pages'} onClick={() => onTab('pages')}>
          Pages
        </button>
        <button type="button" role="tab" aria-selected={tab === 'contents'} onClick={() => onTab('contents')}>
          Contents
        </button>
      </div>
      {!pdf ? (
        <div className="rd-left-body">
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} className="rd-thumb-skel" />
          ))}
        </div>
      ) : tab === 'pages' ? (
        <Thumbs pdf={pdf} page={page} />
      ) : (
        <div className="rd-left-body rd-toc">
          {outline == null ? <p className="rd-muted">Loading…</p> : outline.length ? <Toc items={outline} pdf={pdf} /> : <p className="rd-muted">This PDF has no table of contents.</p>}
        </div>
      )}
    </aside>
  );
}

function Toc({ items, pdf, depth = 0 }: { items: OutlineItem[]; pdf: PdfControls; depth?: number }) {
  return (
    <ul className="rd-toc-list" style={{ ['--depth' as string]: depth }}>
      {items.map((it, i) => (
        <li key={`${it.title}-${i}`}>
          <button type="button" onClick={() => pdf.goToDest(it.dest)}>
            {it.title || 'Untitled section'}
          </button>
          {it.items?.length > 0 && depth < 3 && <Toc items={it.items} pdf={pdf} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );
}

const THUMB_W = 132;

function Thumbs({ pdf, page }: { pdf: PdfControls; page: number }) {
  const listRef = useRef<HTMLDivElement>(null);
  // keep the current page's thumbnail in view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-thumb="${page}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [page]);
  return (
    <div className="rd-left-body rd-thumbs" ref={listRef}>
      {Array.from({ length: pdf.pageCount }, (_, i) => (
        <Thumb key={i + 1} n={i + 1} pdf={pdf} current={page === i + 1} root={listRef} />
      ))}
    </div>
  );
}

function Thumb({ n, pdf, current, root }: { n: number; pdf: PdfControls; current: boolean; root: React.RefObject<HTMLDivElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || drawn) return;
    let task: { cancel(): void; promise: Promise<void> } | null = null;
    const io = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting || task) return;
        io.disconnect();
        try {
          const p = await pdf.doc.getPage(n);
          const base = p.getViewport({ scale: 1 });
          const ratio = Math.min(2, window.devicePixelRatio || 1);
          const viewport = p.getViewport({ scale: (THUMB_W / base.width) * ratio });
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          task = p.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport });
          await task.promise;
          setDrawn(true);
        } catch {
          /* cancelled or unreadable page: leave the blank card */
        }
      },
      { root: root.current, rootMargin: '300px 0px' },
    );
    io.observe(canvas);
    return () => {
      io.disconnect();
      task?.cancel();
    };
  }, [n, pdf, drawn, root]);
  return (
    <button type="button" className={`rd-thumb${current ? ' is-current' : ''}`} data-thumb={n} onClick={() => pdf.goTo(n)} aria-label={`Page ${n}`} aria-current={current ? 'page' : undefined}>
      <canvas ref={canvasRef} style={{ width: THUMB_W }} />
      <span>{n}</span>
    </button>
  );
}
