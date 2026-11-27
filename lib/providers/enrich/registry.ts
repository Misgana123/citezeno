import { coreEnricher } from '../core';
import { crossrefEnricher } from '../crossref';
import { semanticScholarEnricher } from '../semanticscholar';
import { unpaywallEnricher } from '../unpaywall';
import type { EnricherDefinition } from './types';

/* Every provider that can fill in paper details. Listed in PAPER_ENRICHERS
   (comma-separated, asked in that order) to be used; none by default. */
export const ENRICH_PROVIDERS: Readonly<Record<string, EnricherDefinition>> = {
  [unpaywallEnricher.name]: unpaywallEnricher,
  [crossrefEnricher.name]: crossrefEnricher,
  [coreEnricher.name]: coreEnricher,
  [semanticScholarEnricher.name]: semanticScholarEnricher,
};

export const DEFAULT_ENRICHERS: string[] = [];
