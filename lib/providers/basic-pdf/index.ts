import type { PdfTextReader } from '../pdf-text/types';
import type { ProviderDefinition } from '../types';
import { readPdfBasic } from './reader';

/* Our own PDF reader, registered as a PDF text provider. It runs on our server
   and makes no outside calls, so it doesn't need the gateway. */
export const basicPdfReader: PdfTextReader = {
  name: 'basic',
  read: async (bytes) => readPdfBasic(bytes),
};

export const basicPdfProvider: ProviderDefinition<PdfTextReader> = {
  name: basicPdfReader.name,
  create: () => basicPdfReader,
};
