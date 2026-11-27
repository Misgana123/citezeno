import type { Paper } from '../types';
import type { ExploreSort } from './query';

/* What the Explore endpoints send the browser. */

/* One page of the feed. `from` says where it came from: our own copy of papers,
   or (while the copy is off or nearly empty) a saved list from the primary source. */
export type ExploreList = {
  papers: Paper[];
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
  sort: ExploreSort;
  from: 'copy' | 'live';
};

export type FacetCount = { value: string; count: number };

/* How many papers each filter choice would show, given the other filters. */
export type ExploreFacets = {
  total: number;
  subjects: FacetCount[];
  types: FacetCount[];
  sources: FacetCount[];
  years: FacetCount[]; // the last 15 years, oldest first
  access: { openAccess: number; hasPdf: number; hasAbstract: number };
  citations: FacetCount[]; // "10", "100", "1000": papers cited at least that often
};
