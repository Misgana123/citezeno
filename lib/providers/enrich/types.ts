import type { Paper } from '@/lib/papers/types';
import type { ProviderDefinition } from '../types';

/* The "fill in paper details" job. A provider here doesn't search: given DOIs,
   it says what it knows about each paper (a free PDF link, an abstract, its
   license…), so papers we already have can have their gaps filled. */

export type PaperPatch = Partial<
  Pick<Paper, 'title' | 'authors' | 'year' | 'publicationDate' | 'source' | 'type' | 'abstract' | 'citedByCount' | 'isOpenAccess' | 'pdfUrl' | 'license' | 'isRetracted'>
>;

export type PatchField = keyof PaperPatch;

export interface PaperEnricher {
  readonly name: string;
  /* The fields it can fill; papers missing none of them are not sent to it. */
  readonly fills: readonly PatchField[];
  /* What it knows for each DOI (lowercase), keyed by DOI; DOIs it doesn't know are left out. */
  lookup(dois: string[]): Promise<Map<string, PaperPatch>>;
}

export type EnricherDefinition = ProviderDefinition<PaperEnricher>;
