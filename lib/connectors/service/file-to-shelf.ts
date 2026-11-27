import { ShelfError } from '@/lib/shelf/errors';
import { looksLikePdf } from '@/lib/shelf/pdf/check';
import { beginUpload, completeUpload, type CompleteResult, type MatchDeps, type PdfDeps } from '@/lib/shelf/service/pdf-upload';
import { deletePdf, getPdfRow } from '@/lib/shelf/store/pdfs';
import { openCapability, type ConnectorDeps } from '../access';

/* A PDF from the user's cloud files onto their shelf: the same checks and
   steps as an upload from their computer (size, storage, daily uploads, then
   reading it and suggesting the paper), except our server fetches the file
   instead of the browser sending it. A Google Doc comes as its PDF. */
export async function cloudFileToShelf(d: ConnectorDeps, pdf: PdfDeps & MatchDeps, userId: string, f: { fileId: string; itemId?: string | null }): Promise<CompleteResult> {
  const { api } = await openCapability(d, userId, 'files');
  const file = await api.get(f.fileId);
  if (file.kind !== 'pdf' && file.kind !== 'document') throw new ShelfError('invalid_file', `“${file.name}” isn’t a PDF. Only PDFs (and Google Docs, as PDFs) can be added to your shelf.`);
  if (!pdf.store) throw new ShelfError('unavailable', 'PDF uploads aren’t set up yet. Please try again later.');
  const got = await api.download(f.fileId, { maxBytes: pdf.config.pdfMaxBytes, as: 'pdf' });
  if (!looksLikePdf(got.bytes)) throw new ShelfError('invalid_file', `“${file.name}” isn’t a valid PDF.`);
  const begun = await beginUpload(pdf, userId, { fileName: got.name.toLowerCase().endsWith('.pdf') ? got.name : `${got.name}.pdf`, sizeBytes: got.bytes.byteLength, itemId: f.itemId ?? null });
  const row = await getPdfRow(pdf.db, userId, begun.pdf.id);
  try {
    if (!row) throw new ShelfError('not_found', 'That upload no longer exists. Please try again.');
    await pdf.store.write(row.storageKey, got.bytes, 'application/pdf');
  } catch (e) {
    await deletePdf(pdf.db, userId, begun.pdf.id).catch(() => {});
    throw e;
  }
  return completeUpload(pdf, userId, begun.pdf.id);
}
