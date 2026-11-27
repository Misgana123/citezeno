import type { PageText, PageTextItem, PdfPages, PdfText, PdfTextReader } from '../pdf-text/types';

/* PDF.js (pdfjs-dist) on our server: each page's text runs with their
   positions, for the reader's passages, and the plain text and metadata. It
   runs locally and makes no outside calls, so it doesn't need the gateway.
   Loaded only when a PDF is read (a dynamic import), never in the browser bundle. */

export const PROVIDER = 'pdfjs';

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let loaded: Promise<PdfJs> | null = null;
const pdfjs = () => (loaded ??= import('pdfjs-dist/legacy/build/pdf.mjs'));

type RawItem = { str?: string; transform?: number[]; width?: number; height?: number; hasEOL?: boolean };

const clamp = (n: number) => Math.min(1, Math.max(0, n));
const round = (n: number) => Math.round(n * 1e5) / 1e5;

/* A text run's box on the page: PDF.js gives its transform in PDF space
   (origin bottom-left); the viewport's transform turns that into top-left page
   space. The box spans from the baseline up by the font size. */
export function itemBox(vt: number[], it: RawItem, pageW: number, pageH: number): PageTextItem | null {
  if (typeof it.str !== 'string' || !it.transform) return null;
  const [a, b, c, d, e, f] = it.transform;
  // viewport ∘ item: where the run starts, and its font size along the page
  const x = vt[0] * e + vt[2] * f + vt[4];
  const y = vt[1] * e + vt[3] * f + vt[5];
  const fontSize = Math.hypot(vt[0] * c + vt[2] * d, vt[1] * c + vt[3] * d) || Math.hypot(a, b);
  const vertical = Math.abs(vt[0] * a + vt[2] * b) < Math.abs(vt[1] * a + vt[3] * b);
  const len = (it.width ?? 0) * Math.hypot(vt[0], vt[1]);
  const box = vertical ? { x: x - fontSize, y, w: fontSize, h: len } : { x, y: y - fontSize, w: len, h: fontSize };
  return {
    str: it.str,
    x: round(clamp(box.x / pageW)),
    y: round(clamp(box.y / pageH)),
    w: round(clamp(box.w / pageW)),
    h: round(clamp(box.h / pageH)),
    size: round(fontSize / pageH),
    eol: it.hasEOL === true,
    ...(vertical ? { vertical: true } : {}),
  };
}

const DOI = /(?:doi(?:\.org)?\s*[:/]\s*|https?:\/\/(?:dx\.)?doi\.org\/|\b)(10\.\d{4,9}\/[^\s"'<>,;]+)/i;

export function pageToText(page: PageText): string {
  return page.items.map((i) => i.str + (i.eol ? '\n' : '')).join('');
}

/* Open a PDF, use it, and always free it (the loading task owns the document). */
async function withPdf<T>(bytes: Uint8Array, use: (doc: Awaited<ReturnType<PdfJs['getDocument']>['promise']>) => Promise<T>): Promise<T> {
  const lib = await pdfjs();
  // PDF.js takes ownership of the buffer it is given: hand it a copy
  const task = lib.getDocument({ data: bytes.slice(), disableFontFace: true, useSystemFonts: false, verbosity: 0, stopAtErrors: false });
  try {
    return await use(await task.promise);
  } finally {
    await task.destroy();
  }
}

export async function readPdfPages(bytes: Uint8Array, opts: { maxPages?: number } = {}): Promise<PdfPages> {
  return withPdf(bytes, async (doc) => {
    const count = doc.numPages;
    const last = Math.min(count, opts.maxPages ?? count);
    const pages: PageText[] = [];
    for (let n = 1; n <= last; n++) {
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = (content.items as RawItem[]).map((it) => itemBox(vp.transform, it, vp.width, vp.height)).filter((i): i is PageTextItem => i != null && (i.str.length > 0 || i.eol));
      pages.push({ page: n, width: Math.round(vp.width), height: Math.round(vp.height), items });
      page.cleanup();
    }
    return { pageCount: count, pages };
  });
}

export async function readPdfText(bytes: Uint8Array): Promise<PdfText> {
  return withPdf(bytes, async (doc) => {
    const meta = await doc.getMetadata().catch(() => null);
    const info = (meta?.info ?? {}) as { Title?: unknown };
    const title = typeof info.Title === 'string' && info.Title.trim().length > 3 ? info.Title.trim() : null;
    const texts: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      texts.push((content.items as RawItem[]).map((i) => (i.str ?? '') + (i.hasEOL ? '\n' : '')).join(''));
      page.cleanup();
    }
    const text = texts.join('\n\n').trim();
    const doi = (texts[0] ?? '').match(DOI)?.[1]?.replace(/[.)\]}]+$/, '').toLowerCase() ?? null;
    return { pageCount: doc.numPages, title, doi, text };
  });
}

export const pdfjsReader: PdfTextReader = { name: PROVIDER, read: readPdfText, readPages: readPdfPages };
