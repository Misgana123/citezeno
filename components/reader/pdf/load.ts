'use client';

/* PDF.js, loaded only on the reader page (a dynamic import), with its worker
   served from our own origin. The viewer module reads the library from
   globalThis.pdfjsLib, so that is set first. */

type Lib = typeof import('pdfjs-dist');
type ViewerLib = typeof import('pdfjs-dist/web/pdf_viewer.mjs');

let loading: Promise<{ pdfjs: Lib; viewer: ViewerLib }> | null = null;

export function loadPdfjs() {
  return (loading ??= (async () => {
    const pdfjs = await import('pdfjs-dist');
    // the version in the URL lets the worker be cached for good
    pdfjs.GlobalWorkerOptions.workerSrc = `/api/reader/worker?v=${pdfjs.version}`;
    (globalThis as unknown as { pdfjsLib: Lib }).pdfjsLib = pdfjs;
    const viewer = await import('pdfjs-dist/web/pdf_viewer.mjs');
    return { pdfjs, viewer };
  })().catch((e) => {
    loading = null;
    throw e;
  }));
}

export type PdfDoc = Awaited<ReturnType<Lib['getDocument']>['promise']>;
