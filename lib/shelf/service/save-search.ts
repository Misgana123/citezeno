import { isPapersError } from '@/lib/papers/errors';
import { toWorkId } from '@/lib/papers/ids';
import type { OpenAlexClient } from '@/lib/papers/openalex/client';
import { getPaper as fetchPaper } from '@/lib/papers/related/paper';
import { readClientPaper } from '../api/paper-schema';
import type { Db } from '../db';
import { findExactDuplicate } from '../dedupe/exact';
import { ShelfError } from '../errors';
import { ensureShared, getShared, putShared } from '../store/papers';
import type { ShelfItem, ShelfPaper } from '../types';
import { alreadySaved, shelve } from './shelve';

/* Save a paper from Find Papers (a result card or the preview).
   - Already on the shelf → "duplicate", with no OpenAlex call.
   - Already a shared record → reused, with no OpenAlex call.
   - Otherwise the details come from OpenAlex (`/works/{id}`, free and cached),
     never from the browser, so nobody can change a shared record's details.
   - If OpenAlex can't be reached, the details the browser already showed are
     kept for now and the record is refreshed later ("pending"). */

export type SaveDeps = { db: Db; client: OpenAlexClient };
export type SaveSearchInput = { paperId: string; paper?: unknown; projectId?: string | null };
export type SaveResult = { item: ShelfItem; pending: boolean };

const OUTAGE = new Set(['unavailable', 'busy', 'budget']);

export async function saveFromSearch(deps: SaveDeps, userId: string, input: SaveSearchInput): Promise<SaveResult> {
  const id = toWorkId(input.paperId);
  if (!id) throw new ShelfError('bad_request', 'That is not a valid paper ID.');

  const dup = await findExactDuplicate(deps.db, userId, { openalexId: id });
  if (dup) throw alreadySaved(dup);

  let record: ShelfPaper | undefined = (await getShared(deps.db, [id]))[0];
  let pending = false;
  let fresh: Awaited<ReturnType<typeof fetchPaper>>['paper'] | null = null;
  if (!record) {
    try {
      fresh = (await fetchPaper(deps.client, id)).paper;
    } catch (e) {
      const fallback = isPapersError(e) && OUTAGE.has(e.code) ? readClientPaper(input.paper, id) : null;
      if (!fallback) throw e;
      fresh = fallback;
      pending = true;
    }
  }

  const item = await shelve(deps.db, userId, {
    keys: { openalexId: id, doi: record?.doi ?? fresh?.doi },
    via: 'search',
    projectId: input.projectId,
    paper: async (q) => record ?? (pending ? ensureShared(q, fresh!) : putShared(q, fresh!)),
  });
  return { item, pending };
}
