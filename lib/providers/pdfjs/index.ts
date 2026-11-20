import type { PdfTextReader } from '../pdf-text/types';
import type { ProviderDefinition } from '../types';
import { pdfjsReader } from './reader';

/* PDF.js, registered as a PDF text provider. It can read each page's text
   with positions (readPages), which the reader's passages need. */
export const pdfjsProvider: ProviderDefinition<PdfTextReader> = {
  name: pdfjsReader.name,
  create: () => pdfjsReader,
};
