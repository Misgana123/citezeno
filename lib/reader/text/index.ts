import type { PdfPages } from '@/lib/providers/pdf-text/types';
import { cleanLines } from './clean';
import { pageLines } from './lines';
import { toBlocks } from './paragraphs';
import { toPassages, type Passage } from './passages';

export type { Passage } from './passages';

/* A PDF's pages → the reader's passages. The one place text processing
   happens, so OCR for scanned PDFs can be added here later without changing
   the reader. "no_text": the PDF has (almost) no text layer — a scan. */
export type ProcessedText = { status: 'ready'; passages: Passage[]; tokenCount: number } | { status: 'no_text' };

/* Fewer letters than this per page on average → treated as a scan. */
const MIN_CHARS_PER_PAGE = 40;

export function processPages(pdf: PdfPages): ProcessedText {
  const chars = pdf.pages.reduce((n, p) => n + p.items.reduce((m, i) => m + i.str.replace(/\s/g, '').length, 0), 0);
  if (!pdf.pages.length || chars < MIN_CHARS_PER_PAGE * pdf.pages.length) return { status: 'no_text' };
  const lines = cleanLines(pdf.pages.map(pageLines));
  const passages = toPassages(toBlocks(lines));
  if (!passages.length) return { status: 'no_text' };
  const tokenCount = passages.filter((p) => !p.isReferences).reduce((n, p) => n + p.tokens, 0);
  return { status: 'ready', passages, tokenCount };
}
