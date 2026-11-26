import { changeItem } from '@/lib/shelf/service/update-item';
import { getPdfRow } from '@/lib/shelf/store/pdfs';
import type { ReadingStatus } from '@/lib/shelf/types';
import type { ReaderDeps } from '../deps';
import { isReusableLicense } from '../license';
import { signFileLink } from '../sign';
import { getPosition, touchPosition } from '../store/positions';
import { ensureSharedText, ensureUploadText, NO_CREDITS, requeueKeywordsOnly, type TextRow, type TextStatus } from '../store/texts';
import { loadPaper, type ReaderPaper } from './paper';

/* Opening a paper in the reader: which PDF to show, through which short-lived
   link, how far its text processing is, and where the user stopped.

   The PDF, in this order:
     1. the user's own upload (newest), private to them
     2. the open-access PDF: a stored shared copy (reusable licenses), or one
        our server fetches and streams on each open (other or unknown licenses)
     3. none: details and abstract, Open original and Upload PDF */

export type ReaderPdf =
  /* `key` names the copy shown ("upload:<id>" or "open_access"): highlights made on another copy are found again by their text */
  | { kind: 'upload' | 'open_access'; key: string; url: string; fileName: string | null; stored: boolean }
  | { kind: 'none'; reason: 'no_pdf' | 'download_failed' | 'storage_off' };

export type ReaderTextState = { id: string; status: TextStatus; search: 'meaning' | 'keywords' | null; pageCount: number | null; error: string | null };

export type ReaderView = {
  paper: ReaderPaper;
  shelf: { itemId: string; readingStatus: ReadingStatus } | null;
  pdf: ReaderPdf;
  text: ReaderTextState | null;
  position: { page: number } | null;
};

/* Links last long enough to open a paper (PDF.js may come back for more pages). */
export const LINK_TTL_S = 15 * 60;

export const fileRoute = (paperId: string) => `/api/reader/${encodeURIComponent(paperId)}/file`;

export function textState(t: TextRow, embedding: { model: string; dims: number } | null): ReaderTextState {
  const meaning = t.stage === 'done' && embedding != null && t.embeddingModel === embedding.model && t.embeddingDims === embedding.dims;
  return { id: t.id, status: t.status, search: t.status === 'ready' ? (meaning ? 'meaning' : 'keywords') : null, pageCount: t.pageCount, error: t.error };
}

export async function openPaper(deps: ReaderDeps, userId: string, rawId: string, opts: { pdfId?: string | null } = {}): Promise<{ view: ReaderView; needsWork: string | null }> {
  const { paper, item } = await loadPaper(deps, userId, rawId);
  const emb = deps.embedder();
  const embedding = emb ? { model: emb.model.id, dims: emb.dimensions } : null;
  let pdf: ReaderPdf = { kind: 'none', reason: 'no_pdf' };
  let text: TextRow | null = null;

  // a chosen upload of this paper, else the newest
  const upload = (opts.pdfId ? item?.pdfs.find((f) => f.id === opts.pdfId) : undefined) ?? item?.pdfs.at(-1);
  const uploadRow = upload ? await getPdfRow(deps.db, userId, upload.id) : null;
  if (uploadRow && uploadRow.status === 'ready') {
    if (!deps.store) pdf = { kind: 'none', reason: 'storage_off' };
    else {
      text = await ensureUploadText(deps.db, { userId, pdfId: uploadRow.id, paperId: paper.id, title: paper.title });
      // embedding stopped for want of credits: try again now the paper is open
      if (text.error === NO_CREDITS && emb && (await requeueKeywordsOnly(deps.db, text.id))) text = { ...text, stage: 'embed', error: null };
      pdf = { kind: 'upload', key: `upload:${uploadRow.id}`, url: deps.store.downloadUrl(uploadRow.storageKey, { ttlS: LINK_TTL_S, inline: true, fileName: uploadRow.fileName }), fileName: uploadRow.fileName, stored: true };
    }
  } else if (paper.pdfUrl) {
    text = await ensureSharedText(deps.db, { paperId: paper.id, sourceUrl: paper.pdfUrl, license: paper.license ?? null, title: paper.title });
    if (text.status === 'failed' && text.error?.startsWith('download:')) pdf = { kind: 'none', reason: 'download_failed' };
    else if (text.storageKey && deps.store) {
      pdf = { kind: 'open_access', key: 'open_access', url: deps.store.downloadUrl(text.storageKey, { ttlS: LINK_TTL_S, inline: true }), fileName: null, stored: true };
    } else {
      const { exp, sig } = signFileLink(userId, paper.id, LINK_TTL_S, deps.now?.());
      pdf = { kind: 'open_access', key: 'open_access', url: `${fileRoute(paper.id)}?exp=${exp}&sig=${sig}`, fileName: null, stored: false };
    }
  }

  // opening a paper starts it: "To read" → "Reading"
  let shelf = item ? { itemId: item.id, readingStatus: item.readingStatus } : null;
  if (item && item.readingStatus === 'to_read') {
    const changed = await changeItem(deps.db, userId, item.id, { readingStatus: 'reading' });
    shelf = { itemId: changed.id, readingStatus: changed.readingStatus };
  }

  await touchPosition(deps.db, userId, paper.id, paper.title);
  const pos = await getPosition(deps.db, userId, paper.id);
  const needsWork = text && (text.status === 'pending' || text.status === 'processing' || (text.status === 'ready' && text.stage !== 'done' && emb != null)) ? text.id : null;
  return {
    view: { paper, shelf, pdf, text: text ? textState(text, embedding) : null, position: pos ? { page: pos.page } : null },
    needsWork,
  };
}

/* Whether a shared copy may be stored (and so served from storage). */
export const mayStore = (t: Pick<TextRow, 'scope' | 'license'>) => t.scope === 'shared' && isReusableLicense(t.license);
