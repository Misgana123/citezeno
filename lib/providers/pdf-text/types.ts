/* The PDF text extraction job: what an uploaded PDF says about itself. */

export type PdfText = {
  pageCount: number | null;
  title: string | null;
  doi: string | null;
  /* the document's text, pages in order; '' for scanned PDFs */
  text: string;
};

/* A box on a page as fractions of the page size (0–1), from the top-left corner. */
export type PageBox = { x: number; y: number; w: number; h: number };

/* One run of text as the PDF draws it, with where it sits on the page. */
export type PageTextItem = PageBox & {
  str: string;
  /* the run's font size, as a fraction of the page height (for spotting headings) */
  size: number;
  /* the PDF ends a line after this run */
  eol: boolean;
};

export type PageText = { page: number; width: number; height: number; items: PageTextItem[] };

export type PdfPages = { pageCount: number; pages: PageText[] };

export interface PdfTextReader {
  readonly name: string;
  read(bytes: Uint8Array): Promise<PdfText>;
  /* Optional: every page's text runs with their positions (for passages that
     link back to their place on the page). Pages are 1-based. */
  readPages?(bytes: Uint8Array, opts?: { maxPages?: number }): Promise<PdfPages>;
}
