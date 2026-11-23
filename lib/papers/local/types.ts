import type { QueryResult, QueryResultRow } from 'pg';
import type { KeywordQuery, PaperPage } from '@/lib/providers/papers/types';
import type { Paper } from '../types';

/* Our own copy of papers. It has a Postgres version (pg.ts) and an in-memory
   version (memory.ts) for tests and local runs. */

/* What the Postgres store needs (the app's pool, or a test schema's). */
export type Queryable = { query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>> };

/* A paper as kept: full details or a result card, and when its provider last sent it. */
export type StoredPaper = { paper: Paper; detail: boolean; fetchedAt: number };

export interface PaperCopyStore {
  /* Keep these papers (merging with what we have) and note that a user saw them.
     `detail`: they came with full details. `origin`: 'live' or 'seed:<source>'. */
  save(papers: Paper[], opts: { detail: boolean; origin: string }): Promise<void>;
  /* Papers we have under these Citezeno IDs, keyed by the ID asked for. */
  byIds(ids: string[]): Promise<Map<string, StoredPaper>>;
  /* Papers we have with these DOIs (lowercase), keyed by DOI. */
  byDois(dois: string[]): Promise<Map<string, StoredPaper>>;
  /* A user saw these papers (served from the copy). */
  touch(ids: string[]): Promise<void>;
  /* Keyword search over the copy, with filters, sort and paging; `total` is every match. */
  search(q: KeywordQuery): Promise<PaperPage>;
}

/* The row key: the DOI when there is one, so one paper from two providers is one row. */
export const recordKey = (p: Pick<Paper, 'id' | 'doi'>) => (p.doi ? `doi:${p.doi.toLowerCase()}` : p.id);
