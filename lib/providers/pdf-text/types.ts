/* The PDF text extraction job: what an uploaded PDF says about itself. */

export type PdfText = {
  pageCount: number | null;
  title: string | null;
  doi: string | null;
  /* the document's text, pages in order; '' for scanned PDFs */
  text: string;
};

export interface PdfTextReader {
  readonly name: string;
  read(bytes: Uint8Array): Promise<PdfText>;
}
