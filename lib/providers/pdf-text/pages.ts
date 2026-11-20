import { choose, chooseProviders } from '../config';
import type { Env, Gate } from '../types';
import { DEFAULT_PDF_TEXT, PDF_TEXT_PROVIDERS } from './registry';
import type { PdfTextReader } from './types';

export type PdfPagesReader = PdfTextReader & Required<Pick<PdfTextReader, 'readPages'>>;

/* A PDF text reader that can read each page's text with positions (the
   reader's passages need them): the configured one if it can, else the first
   registered provider that can. */
export function pagesReader(env: Env, gate: Gate, registry = PDF_TEXT_PROVIDERS): PdfPagesReader {
  const chosen = chooseProviders(registry, choose.pdfText(env), DEFAULT_PDF_TEXT, 'PDF text');
  for (const def of [...chosen, ...Object.values(registry)]) {
    const reader = def.create(env, gate);
    if (reader?.readPages) return reader as PdfPagesReader;
  }
  throw new Error('No PDF text provider can read page positions.');
}
