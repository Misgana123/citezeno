import { basicPdfProvider } from '../basic-pdf';
import { pdfjsProvider } from '../pdfjs';
import type { ProviderDefinition } from '../types';
import type { PdfTextReader } from './types';

/* Every PDF text provider. To add one (a fuller library, or a remote service
   wired through the gateway): implement PdfTextReader in lib/providers/<name>/,
   add it here, and set PDF_TEXT_PROVIDER. */
export const PDF_TEXT_PROVIDERS: Readonly<Record<string, ProviderDefinition<PdfTextReader>>> = {
  [basicPdfProvider.name]: basicPdfProvider,
  [pdfjsProvider.name]: pdfjsProvider,
};

/* The Shelf's recognising and indexing keeps the built-in reader by default. */
export const DEFAULT_PDF_TEXT = [basicPdfProvider.name];
