'use client';

import { useEffect, useRef } from 'react';
import { loadPdfjs, type PdfDoc } from './load';

/* The PDF itself, rendered by PDF.js's viewer: pages render as they scroll
   into view, with a text layer so text can be selected, copied and searched.
   The parent drives it through the PdfControls handed to onReady. */

export type ScaleValue = 'page-width' | 'page-fit' | 'auto' | number;
export type OutlineItem = { title: string; dest: unknown; items: OutlineItem[] };
export type FindCount = { current: number; total: number };

export type PdfControls = {
  doc: PdfDoc;
  pageCount: number;
  goTo(page: number): void;
  next(): void;
  prev(): void;
  zoom(step: 1 | -1): void;
  setScale(value: ScaleValue): void;
  find(query: string, opts?: { again?: boolean; previous?: boolean }): void;
  clearFind(): void;
  outline(): Promise<OutlineItem[]>;
  goToDest(dest: unknown): void;
  /* the page element PDF.js draws (for the highlight layers) */
  pageElement(page: number): HTMLElement | null;
  /* a box on a page, as fractions of the page, scrolled into view */
  reveal(page: number, box?: { x: number; y: number }): void;
  container: HTMLDivElement;
};

export type PdfEvents = {
  onReady(c: PdfControls): void;
  onPage(page: number): void;
  onScale(scale: number): void;
  onFind(count: FindCount | null, notFound: boolean): void;
  onError(kind: 'load' | 'password'): void;
  /* a page's text layer is drawn (highlights can be placed on it) */
  onPageRendered?(page: number): void;
};

const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];

export function PdfPane({ url, initialPage, initialScale, ...events }: { url: string; initialPage: number; initialScale: ScaleValue } & PdfEvents) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const ev = useRef(events);
  ev.current = events;

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    (async () => {
      const { pdfjs, viewer: lib } = await loadPdfjs();
      if (cancelled || !containerRef.current || !viewerRef.current) return;
      const container = containerRef.current;
      const eventBus = new lib.EventBus();
      const linkService = new lib.PDFLinkService({ eventBus, externalLinkTarget: lib.LinkTarget.BLANK, externalLinkRel: 'noopener noreferrer nofollow' });
      const findController = new lib.PDFFindController({ eventBus, linkService });
      const viewer = new lib.PDFViewer({
        container,
        viewer: viewerRef.current,
        eventBus,
        linkService,
        findController,
        removePageBorders: true,
        annotationEditorMode: pdfjs.AnnotationEditorType.DISABLE,
      });
      linkService.setViewer(viewer);

      // a fitted zoom ("auto", fit to width or page) follows the window's size
      let frame = 0;
      const resize = new ResizeObserver(() => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          const v = viewer.currentScaleValue;
          if (v === 'auto' || v === 'page-width' || v === 'page-fit') viewer.currentScaleValue = v;
        });
      });
      resize.observe(container);

      const task = pdfjs.getDocument({ url, enableXfa: false });
      cleanup = () => {
        resize.disconnect();
        cancelAnimationFrame(frame);
        void task.destroy();
      };
      let doc: PdfDoc;
      try {
        doc = await task.promise;
      } catch (e) {
        if (!cancelled) ev.current.onError((e as Error)?.name === 'PasswordException' ? 'password' : 'load');
        return;
      }
      if (cancelled) return;

      let query = '';
      const find = (q: string, opts: { again?: boolean; previous?: boolean } = {}) => {
        query = q;
        eventBus.dispatch('find', { source: null, type: opts.again ? 'again' : '', query: q, caseSensitive: false, entireWord: false, highlightAll: true, findPrevious: !!opts.previous, matchDiacritics: false });
      };

      eventBus.on('pagesinit', () => {
        viewer.currentScaleValue = String(initialScale);
        if (initialPage > 1 && initialPage <= doc.numPages) viewer.currentPageNumber = initialPage;
        ev.current.onScale(viewer.currentScale);
        ev.current.onPage(viewer.currentPageNumber);
      });
      eventBus.on('pagechanging', (e: { pageNumber: number }) => ev.current.onPage(e.pageNumber));
      eventBus.on('scalechanging', (e: { scale: number }) => ev.current.onScale(e.scale));
      eventBus.on('textlayerrendered', (e: { pageNumber: number }) => ev.current.onPageRendered?.(e.pageNumber));
      eventBus.on('updatefindmatchescount', (e: { matchesCount: FindCount }) => query && ev.current.onFind(e.matchesCount, false));
      eventBus.on('updatefindcontrolstate', (e: { state: number; matchesCount: FindCount }) => {
        if (!query) return;
        ev.current.onFind(e.matchesCount, e.state === lib.FindState.NOT_FOUND);
      });

      viewer.setDocument(doc);
      linkService.setDocument(doc, null);

      const pageEl = (page: number) => container.querySelector<HTMLElement>(`.page[data-page-number="${page}"]`);
      ev.current.onReady({
        doc,
        pageCount: doc.numPages,
        container,
        goTo: (page) => {
          viewer.currentPageNumber = Math.min(doc.numPages, Math.max(1, Math.round(page)));
        },
        next: () => viewer.nextPage(),
        prev: () => viewer.previousPage(),
        zoom: (step) => {
          const cur = viewer.currentScale;
          const next = step > 0 ? (ZOOM_STEPS.find((s) => s > cur + 0.001) ?? ZOOM_STEPS.at(-1)!) : ([...ZOOM_STEPS].reverse().find((s) => s < cur - 0.001) ?? ZOOM_STEPS[0]);
          viewer.currentScaleValue = String(next);
        },
        setScale: (value) => {
          viewer.currentScaleValue = String(value);
        },
        find,
        clearFind: () => {
          query = '';
          eventBus.dispatch('findbarclose', { source: null });
          ev.current.onFind(null, false);
        },
        outline: async () => ((await doc.getOutline()) ?? []) as unknown as OutlineItem[],
        goToDest: (dest) => void linkService.goToDestination(dest as never),
        pageElement: pageEl,
        reveal: (page, box) => {
          const el = pageEl(page);
          if (!el) return viewer.scrollPageIntoView({ pageNumber: page });
          const top = el.offsetTop + (box ? box.y * el.clientHeight : 0) - container.clientHeight * 0.25;
          container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        },
      });
    })().catch(() => !cancelled && ev.current.onError('load'));
    return () => {
      cancelled = true;
      cleanup();
    };
    // a new link (or a re-open) loads the document again; the starting page/scale are read once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return (
    <div className="rd-pdf" ref={containerRef} tabIndex={-1}>
      <div className="pdfViewer" ref={viewerRef} />
    </div>
  );
}
