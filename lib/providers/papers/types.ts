import type { SortKey, WorkType } from '@/lib/papers/search/options';
import type { Paper } from '@/lib/papers/types';
import type { Env, ProviderDefinition } from '../types';

/* The paper data job. Every paper provider returns the Citezeno Paper format
   (lib/papers/types.ts); nothing outside its adapter sees the vendor's data. */

export type PaperFilters = {
  yearFrom: number | null;
  yearTo: number | null;
  openAccess: boolean;
  types: WorkType[];
  language: string | null; // ISO 639-1, e.g. "en"
  hasAbstract: boolean;
  hideRetracted: boolean;
  minCitations: number | null;
};

export type PaperSort = SortKey;

/* A way to point at one paper. `id` is the provider's own paper ID. */
export type PaperRef = { kind: 'id'; id: string } | { kind: 'doi'; doi: string } | { kind: 'pmid'; id: string } | { kind: 'pmcid'; id: string };

/* Keyword search. Left-out settings are left to the provider's defaults. */
export type KeywordQuery = { text: string; filters?: PaperFilters; sort?: PaperSort; page?: number; perPage: number };

/* A related list (references, cited by), filtered, sorted and paged by the provider. */
export type ListQuery = { filters: PaperFilters; sort: PaperSort; page: number; perPage: number };

/* Pooled results: the provider's top matches, which the app filters, sorts and pages itself. */
export type PoolQuery = { text: string; filters: PaperFilters; limit: number };

/* One page of results; `total` is all matches the provider found. */
export type PaperPage = { papers: Paper[]; total: number; costUsd: number };
export type PaperPool = { papers: Paper[]; costUsd: number };

export interface PaperSource {
  readonly name: string;
  readonly limits: {
    /* The longest search text it accepts. */
    maxQueryChars: number;
    /* The most results one search by meaning returns. */
    semanticMax: number;
  };

  /* The provider's paper ID in any form it accepts (an ID, its URL…), or null. */
  parseId(raw: string): string | null;
  search(q: KeywordQuery): Promise<PaperPage>;
  /* One paper with full details; null when it does not exist. */
  getPaper(ref: PaperRef): Promise<{ paper: Paper | null; costUsd: number }>;

  /* ---- optional capabilities: check with supports() before calling ---- */

  /* Search by meaning. Filters it can't apply are left to the app. */
  semanticSearch?(q: PoolQuery): Promise<PaperPool>;
  /* Papers this paper cites. */
  references?(id: string, q: ListQuery): Promise<PaperPage>;
  /* Papers that cite this paper. */
  citedBy?(id: string, q: ListQuery): Promise<PaperPage>;
  /* The provider's own "papers like this one". */
  similar?(id: string, q: Omit<PoolQuery, 'text'>): Promise<PaperPool>;
  /* Many papers in few calls; `found` is keyed by the value asked for (DOIs lowercased). */
  getPapers?(kind: 'id' | 'doi', values: string[]): Promise<{ found: Map<string, Paper>; costUsd: number }>;
}

export type PaperCapability = 'semantic_search' | 'references' | 'cited_by' | 'similar' | 'batch_lookup';

const METHOD: Record<PaperCapability, keyof PaperSource> = {
  semantic_search: 'semanticSearch',
  references: 'references',
  cited_by: 'citedBy',
  similar: 'similar',
  batch_lookup: 'getPapers',
};

/* Whether a source offers an optional capability. */
export const supports = (source: PaperSource, capability: PaperCapability): boolean => typeof source[METHOD[capability]] === 'function';

export type PaperProviderDefinition = ProviderDefinition<PaperSource> & {
  /* Limits the app needs before any source is built (for the search form). */
  limits(env: Env): PaperSource['limits'];
};
