import type { Paper } from '@/lib/papers/types';
import type { PdfTextReader } from '@/lib/providers/pdf-text/types';
import type { PaperSource } from '@/lib/providers/papers/types';
import type { FileStore, UploadTarget } from '@/lib/providers/storage/types';
import type { ManualPaperInput } from '../api/manual-schema';
import type { ShelfConfig } from '../config';
import { tx, type Db } from '../db';
import { ShelfError } from '../errors';
import { resolveInput } from '../lookup/resolve';
import { papersErrorCode } from '../papers-error';
import { cleanFileName, looksLikePdf } from '../pdf/check';
import { readPdf } from '../pdf/reader';
import { getItem, savedMap } from '../store/items';
import { attachPdf, createPending, deletePdf, getPdfRow, markReady, storageUsed, type PdfFound, type PdfRow } from '../store/pdfs';
import type { ShelfItem } from '../types';
import { saveManualPaper } from './save-manual';
import { saveOpenAlexPaper } from './save-openalex';

/* Uploading a PDF, in three steps:

   1. begin    — check the size, the user's storage and daily uploads; reserve a
                 row; hand the browser a signed form to upload straight to storage.
   2. complete — fetch the file back, check it really is a PDF, read it (pages,
                 DOI, title, text), and suggest the paper it is: by DOI (free),
                 else by its title (one search).
   3. confirm  — the user picks the match, an existing paper, or types the
                 details; the PDF is attached to that shelf item.

   With an item given at step 1 ("attach a PDF to this paper"), step 2 attaches
   it straight away. */

export type PdfDeps = {
  db: Db;
  store: FileStore | null;
  pdfText: PdfTextReader;
  config: ShelfConfig;
  /* one more upload today? */
  allowUpload: () => Promise<boolean>;
};

export type PdfSummary = Pick<PdfRow, 'id' | 'fileName' | 'sizeBytes' | 'pageCount' | 'textStatus' | 'itemId'>;
const summary = (r: PdfRow): PdfSummary => ({ id: r.id, fileName: r.fileName, sizeBytes: r.sizeBytes, pageCount: r.pageCount, textStatus: r.textStatus, itemId: r.itemId });

const mb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;
const requireStore = (store: FileStore | null): FileStore => {
  if (!store) throw new ShelfError('unavailable', 'PDF uploads aren’t set up yet. Please try again later.');
  return store;
};

export async function beginUpload(deps: PdfDeps, userId: string, f: { fileName: string; sizeBytes: number; itemId?: string | null }): Promise<{ pdf: PdfSummary; upload: UploadTarget }> {
  const store = requireStore(deps.store);
  if (f.sizeBytes > deps.config.pdfMaxBytes) throw new ShelfError('too_large', `This file is over the ${mb(deps.config.pdfMaxBytes)} limit for PDFs.`, { limit: deps.config.pdfMaxBytes });
  if (f.itemId && !(await getItem(deps.db, userId, f.itemId))) throw new ShelfError('not_found', 'That paper is not on your shelf.');
  const used = await storageUsed(deps.db, userId);
  if (used + f.sizeBytes > deps.config.storageBytesPerUser) {
    throw new ShelfError('storage_full', `Your PDF storage is full (${mb(deps.config.storageBytesPerUser)}). Remove some PDFs to upload more.`, { limit: deps.config.storageBytesPerUser });
  }
  if (!(await deps.allowUpload())) throw new ShelfError('user_limit', `You’ve reached today’s limit of ${deps.config.uploadsPerDay} PDF uploads. Try again tomorrow.`, { limit: deps.config.uploadsPerDay });
  const row = await createPending(deps.db, userId, { fileName: cleanFileName(f.fileName), sizeBytes: f.sizeBytes, itemId: f.itemId });
  return { pdf: summary(row), upload: store.uploadTarget(row.storageKey) };
}

export type Match = { found: PdfFound; candidates: Paper[]; saved: Record<string, string>; matching: 'doi' | 'title' | 'none' | 'unavailable' };
export type CompleteResult = { pdf: PdfSummary; item: ShelfItem | null; match: Match | null };

export type MatchDeps = { papers: () => PaperSource; reserveSearch: () => Promise<void> };

/* Suggest which paper a PDF is: by its DOI (a free lookup), else by its title (a search). */
export async function suggestMatches(db: Db, userId: string, deps: MatchDeps, found: PdfFound): Promise<Match> {
  let candidates: Paper[] = [];
  let matching: Match['matching'] = 'none';
  try {
    if (found.doi) {
      matching = 'doi';
      candidates = (await resolveInput(deps.papers(), { kind: 'doi', doi: found.doi, fromLink: false })).papers;
    }
  } catch (e) {
    if (papersErrorCode(e)) matching = 'unavailable';
    else if ((e as ShelfError).code !== 'not_found') throw e;
  }
  if (!candidates.length && found.title && matching !== 'unavailable') {
    try {
      await deps.reserveSearch();
      matching = 'title';
      candidates = (await resolveInput(deps.papers(), { kind: 'title', title: found.title })).papers;
    } catch (e) {
      const code = papersErrorCode(e);
      if (code === 'user_limit' || code === 'busy' || code === 'unavailable' || code === 'budget') matching = 'unavailable';
      else throw e;
    }
  }
  const saved = await savedMap(db, userId, candidates.map((p) => p.openalexId));
  return { found, candidates, saved, matching };
}

export async function completeUpload(deps: PdfDeps & MatchDeps, userId: string, pdfId: string): Promise<CompleteResult> {
  const store = requireStore(deps.store);
  const row = await getPdfRow(deps.db, userId, pdfId);
  if (!row) throw new ShelfError('not_found', 'That upload no longer exists. Please upload the file again.');
  if (row.status === 'ready') {
    const item = row.itemId ? await getItem(deps.db, userId, row.itemId) : null;
    return { pdf: summary(row), item, match: item ? null : await suggestMatches(deps.db, userId, deps, row.found ?? { doi: null, title: null }) };
  }

  const bytes = await store.read(row.storageKey, deps.config.pdfMaxBytes);
  if (!bytes) {
    await deletePdf(deps.db, userId, row.id);
    throw new ShelfError('bad_request', `The upload didn’t finish, or the file is over the ${mb(deps.config.pdfMaxBytes)} limit. Please try again.`);
  }
  if (!looksLikePdf(bytes)) {
    await deletePdf(deps.db, userId, row.id);
    throw new ShelfError('invalid_file', 'This file isn’t a valid PDF.');
  }

  let info: Awaited<ReturnType<typeof readPdf>> | null = null;
  try {
    info = await readPdf(deps.pdfText, bytes);
  } catch (e) {
    console.warn('[citezeno] shelf: could not read a PDF', (e as Error).message);
  }
  const found: PdfFound = { doi: info?.doi ?? null, title: info?.title ?? null };
  const ready = await markReady(deps.db, userId, row.id, {
    sizeBytes: bytes.byteLength,
    pageCount: info?.pageCount ?? null,
    textStatus: !info ? 'failed' : info.hasText ? 'done' : 'none',
    text: info?.hasText ? info.text : null,
    found,
  });
  if (!ready) throw new ShelfError('not_found', 'That upload no longer exists. Please upload the file again.');

  if (ready.itemId) return { pdf: summary(ready), item: await getItem(deps.db, userId, ready.itemId), match: null };
  return { pdf: summary(ready), item: null, match: await suggestMatches(deps.db, userId, deps, found) };
}

export type ConfirmChoice = { paperId: string; projectId?: string | null } | { itemId: string } | { details: ManualPaperInput; projectId?: string | null };

/* Attach a matched PDF: to an OpenAlex paper (saved if needed), to a paper
   already on the shelf, or to a paper typed in by hand. */
export async function confirmUpload(deps: { db: Db; papers: () => PaperSource }, userId: string, pdfId: string, choice: ConfirmChoice): Promise<ShelfItem> {
  const row = await getPdfRow(deps.db, userId, pdfId);
  if (!row || row.status !== 'ready') throw new ShelfError('not_found', 'That upload no longer exists. Please upload the file again.');
  if (row.itemId) throw new ShelfError('bad_request', 'This PDF is already attached to a paper.');

  let itemId: string;
  if ('itemId' in choice) itemId = choice.itemId;
  else if ('details' in choice) itemId = (await saveManualPaper(deps.db, userId, choice.details, choice.projectId, 'upload')).id;
  else {
    try {
      itemId = (await saveOpenAlexPaper({ db: deps.db, papers: deps.papers() }, userId, { paperId: choice.paperId, via: 'upload', projectId: choice.projectId })).item.id;
    } catch (e) {
      // already on the shelf: the PDF goes to that paper
      if ((e as ShelfError).code === 'duplicate' && (e as ShelfError).details.itemId) itemId = (e as ShelfError).details.itemId!;
      else throw e;
    }
  }
  return tx(deps.db, async (q) => {
    if (!(await attachPdf(q, userId, pdfId, itemId))) throw new ShelfError('not_found', 'That paper is not on your shelf.');
    return (await getItem(q, userId, itemId)) as ShelfItem;
  });
}
