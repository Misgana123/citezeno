import { basicPdfProvider } from '../basic-pdf';
import type { ProviderDefinition } from '../types';
import type { PdfTextReader } from './types';

/* Every PDF text provider. To add one (a fuller library, or a remote service
   wired through the gateway): implement PdfTextReader in lib/providers/<name>/,
   add it here, and set PDF_TEXT_PROVIDER. */
export const PDF_TEXT_PROVIDERS: Readonly<Record<string, ProviderDefinition<PdfTextReader>>> = {
  [basicPdfProvider.name]: basicPdfProvider,
};

export const DEFAULT_PDF_TEXT = [basicPdfProvider.name];
