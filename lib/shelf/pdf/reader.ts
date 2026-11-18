import { readPdfBasic, type PdfInfo } from './basic-reader';

/* The one place the app reads PDFs. Swapping in a fuller library later (for
   better text on complex layouts) only changes this file. */
export type { PdfInfo };

/* Enough letters to call it text; less means a scanned PDF (pictures of pages). */
const MIN_TEXT = 200;

export function readPdf(bytes: Uint8Array): PdfInfo & { hasText: boolean } {
  const info = readPdfBasic(bytes);
  return { ...info, hasText: (info.text.match(/\p{L}/gu)?.length ?? 0) >= MIN_TEXT };
}
