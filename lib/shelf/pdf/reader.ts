import type { PdfText, PdfTextReader } from '@/lib/providers/pdf-text/types';

/* The one place the app reads PDFs, through the configured PDF text provider
   (PDF_TEXT_PROVIDER). Swapping in a fuller reader is a configuration change. */

/* Enough letters to call it text; less means a scanned PDF (pictures of pages). */
const MIN_TEXT = 200;

export async function readPdf(reader: PdfTextReader, bytes: Uint8Array): Promise<PdfText & { hasText: boolean }> {
  const info = await reader.read(bytes);
  return { ...info, hasText: (info.text.match(/\p{L}/gu)?.length ?? 0) >= MIN_TEXT };
}
