import type { ReaderDeps } from '../deps';
import { getSharedText, getUploadText, type TextRow } from '../store/texts';
import { loadPaper, type LoadedPaper } from './paper';

/* The text the user reads for a paper: from their newest upload when there is
   one, else the paper's shared open-access text. Never another user's upload. */
export async function readableText(deps: ReaderDeps, userId: string, rawId: string): Promise<{ loaded: LoadedPaper; text: TextRow | null }> {
  const loaded = await loadPaper(deps, userId, rawId);
  const upload = loaded.item?.pdfs.at(-1);
  if (upload) return { loaded, text: await getUploadText(deps.db, userId, upload.id) };
  return { loaded, text: loaded.paper.pdfUrl ? await getSharedText(deps.db, loaded.paper.id) : null };
}
