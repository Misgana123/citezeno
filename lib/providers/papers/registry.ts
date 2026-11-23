import { arxivProvider } from '../arxiv';
import { clinicalTrialsProvider } from '../clinicaltrials';
import { europePmcProvider } from '../europepmc';
import { openAlexProvider } from '../openalex';
import { pubmedProvider } from '../pubmed';
import { semanticScholarProvider } from '../semanticscholar';
import type { PaperProviderDefinition } from './types';

/* Every paper data provider the app can use. To add one: write its adapter in
   lib/providers/<name>/ (implementing PaperSource), add it here, and list it in
   PAPER_PROVIDERS. No feature code changes. */
export const PAPER_PROVIDERS: Readonly<Record<string, PaperProviderDefinition>> = {
  [openAlexProvider.name]: openAlexProvider,
  [arxivProvider.name]: arxivProvider,
  [pubmedProvider.name]: pubmedProvider,
  [europePmcProvider.name]: europePmcProvider,
  [semanticScholarProvider.name]: semanticScholarProvider,
  [clinicalTrialsProvider.name]: clinicalTrialsProvider,
};

export const DEFAULT_PAPER_PROVIDERS = [openAlexProvider.name];
