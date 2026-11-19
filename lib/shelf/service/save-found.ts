import { paperId } from '@/lib/papers/ids';
import { getPaper as fetchPaper } from '@/lib/papers/related/paper';
import type { Paper } from '@/lib/papers/types';
import { resolvePaperId, type PaperSources } from '@/lib/providers/papers/sources';
import { readClientPaper } from '../api/paper-schema';
import type { Db } from '../db';
import { findExactDuplicate } from '../dedupe/exact';
import { ShelfError } from '../errors';
import { papersErrorCode } from '../papers-error';
import { ensureShared, getShared, putShared } from '../store/papers';
import type { AddedVia, ShelfItem, ShelfPaper } from '../types';
import { alreadySaved, shelve } from './shelve';

/* Save a paper found through a paper provider: from Find Papers (a result card
   or the preview), or one the user picked after looking up a DOI, link or title.
   - Already on the shelf → "duplicate", with no provider call.
   - Already a shared record → reused, with no provider call.
   - Otherwise the details come from its provider (free and cached for
     OpenAlex), never from the browser, so nobody can change a shared record.
   - If the provider can't be reached, the details the browser already showed
     are kept for now and the record is refreshed later ("pending"). */

export type SaveDeps = { db: Db; sources: PaperSources };
export type SaveFoundInput = { paperId: string; via?: Exclude<AddedVia, 'manual'>; paper?: unknown; projectId?: string | null };
export type SaveResult = { item: ShelfItem; pending: boolean };

const OUTAGE = new Set(['unavailable', 'busy', 'budget']);

export async function saveFoundPaper(deps: SaveDeps, userId: string, input: SaveFoundInput): Promise<SaveResult> {
  const target = resolvePaperId(deps.sources, input.paperId);
  if (!target) throw new ShelfError('bad_request', 'That is not a valid paper ID.');
  const id = paperId(target.source.name, target.id);

  const dup = await findExactDuplicate(deps.db, userId, { paperId: id });
  if (dup) throw alreadySaved(dup);

  let record: ShelfPaper | undefined = (await getShared(deps.db, [id]))[0];
  let pending = false;
  let fresh: Paper | null = null;
  if (!record) {
    try {
      fresh = (await fetchPaper(target)).paper;
    } catch (e) {
      const code = papersErrorCode(e);
      const fallback = code && OUTAGE.has(code) ? readClientPaper(input.paper, id) : null;
      if (!fallback) throw e;
      fresh = fallback;
      pending = true;
    }
  }

  const item = await shelve(deps.db, userId, {
    keys: { paperId: id, doi: record?.doi ?? fresh?.doi },
    via: input.via ?? 'search',
    projectId: input.projectId,
    paper: async (q) => record ?? (pending ? ensureShared(q, fresh!) : putShared(q, fresh!)),
  });
  return { item, pending };
}
