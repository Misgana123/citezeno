import type { Paper } from '@/lib/papers/types';
import type { PaperSource } from '@/lib/providers/papers/types';
import { tx, type Db, type Queryable } from '../db';
import { ShelfError } from '../errors';
import type { ImportEntry } from '../import/types';
import { lookupDois } from '../lookup/batch';
import { papersErrorCode } from '../papers-error';
import { claimImport, finishImport, noteLookupFailure, pendingEntries, releaseImport, settleEntry, type ClaimedImport, type EntryStatus } from '../store/imports';
import { createPrivate, putShared } from '../store/papers';
import { shelveLean } from './shelve';

/* Working through an import, a batch at a time, until a deadline:
   - entries with a DOI are looked up together; a match becomes the shared
     OpenAlex record ("matched"),
   - the rest are kept as written in the file ("added"),
   - exact duplicates are skipped ("duplicate"), anything else is "failed".
   If OpenAlex is down the batch waits for a later run; after three failed
   tries the entries are kept as written instead. */

export const IMPORT_BATCH = 50;
const MAX_LOOKUP_FAILURES = 3;

export type ImportRunDeps = { db: Db; papers: PaperSource; now?: () => number };
export type SliceResult = 'done' | 'more' | 'waiting' | 'busy';

export function entryDetails(e: ImportEntry): Omit<Paper, 'id' | 'provider'> {
  return {
    record: null,
    doi: e.doi,
    title: e.title ?? 'Untitled',
    authors: e.authors.map((name) => ({ name, orcid: null })),
    year: e.year,
    publicationDate: null,
    source: e.source,
    type: e.type,
    language: null,
    abstract: e.abstract,
    citedByCount: 0,
    isOpenAccess: false,
    pdfUrl: null,
    landingUrl: e.url,
    isRetracted: false,
    topics: [],
    referenceIds: [],
  };
}

/* One entry, inside the batch's transaction. A savepoint keeps a failing
   entry from undoing the others. */
async function addEntry(q: Queryable, job: ClaimedImport, e: ImportEntry, match: Paper | undefined): Promise<{ status: EntryStatus; itemId?: string; reason?: string }> {
  const save = async (projectId: string | null) => {
    await q.query('savepoint entry');
    try {
      const id = await shelveLean(q, job.userId, {
        keys: match ? { paperId: match.id, doi: match.doi } : { doi: e.doi },
        via: 'import',
        projectId,
        paper: (qq) => (match ? putShared(qq, match) : createPrivate(qq, job.userId, entryDetails(e), 'import')),
      });
      await q.query('release savepoint entry');
      return id;
    } catch (err) {
      await q.query('rollback to savepoint entry');
      throw err;
    }
  };
  try {
    let itemId: string;
    try {
      itemId = await save(job.projectId);
    } catch (err) {
      // the chosen project was deleted meanwhile: still import the paper
      if ((err as ShelfError).code === 'not_found' && job.projectId) itemId = await save(null);
      else throw err;
    }
    return { status: match ? 'matched' : 'added', itemId };
  } catch (err) {
    if ((err as ShelfError).code === 'duplicate') return { status: 'duplicate', itemId: (err as ShelfError).details.itemId };
    console.warn('[citezeno] shelf: import entry failed', (err as Error).message);
    return { status: 'failed', reason: 'Could not be added' };
  }
}

/* Work on one claimed import until the deadline. */
export async function runClaimedImport(deps: ImportRunDeps, job: ClaimedImport, deadline: number): Promise<SliceResult> {
  const now = deps.now ?? Date.now;
  let failures = job.lookupFailures;
  try {
    while (now() < deadline) {
      const batch = await pendingEntries(deps.db, job.id, IMPORT_BATCH);
      if (!batch.length) {
        await finishImport(deps.db, job.id);
        return 'done';
      }
      let found = new Map<string, Paper>();
      const dois = batch.map((b) => b.data.doi).filter((d): d is string => !!d);
      if (dois.length && failures < MAX_LOOKUP_FAILURES) {
        try {
          found = await lookupDois(deps.papers, dois);
        } catch (e) {
          if (!papersErrorCode(e)) throw e;
          failures = await noteLookupFailure(deps.db, job.id);
          if (failures < MAX_LOOKUP_FAILURES) return 'waiting';
        }
      }
      // the whole batch commits once
      await tx(deps.db, async (q) => {
        for (const { idx, data } of batch) {
          const r = await addEntry(q, job, data, data.doi ? found.get(data.doi.toLowerCase()) : undefined);
          await settleEntry(q, job.id, idx, r.status, r);
        }
      });
    }
    return 'more';
  } finally {
    await releaseImport(deps.db, job.id);
  }
}

/* Work on one import (for its owner's page) or the oldest waiting one (background). */
export async function runImportSlice(deps: ImportRunDeps, opts: { id?: string; userId?: string; budgetMs: number }): Promise<SliceResult> {
  const now = deps.now ?? Date.now;
  const job = await claimImport(deps.db, { id: opts.id, userId: opts.userId, lockS: Math.ceil(opts.budgetMs / 1000) + 30 });
  if (!job) return 'busy';
  return runClaimedImport(deps, job, now() + opts.budgetMs);
}
