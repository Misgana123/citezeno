import { paperId as qualify } from '@/lib/papers/ids';
import { getPaper } from '@/lib/papers/related/paper';
import type { Paper } from '@/lib/papers/types';
import { resolvePaperId } from '@/lib/providers/papers/sources';
import { getItemByPaper } from '@/lib/shelf/store/items';
import type { ShelfItem } from '@/lib/shelf/types';
import { ReaderError } from '../errors';
import type { ReaderDeps } from '../deps';

/* The paper the reader opens: the user's shelf copy when it is there (it may
   be a paper only the shelf knows, added by hand or imported), otherwise from
   the paper source (OpenAlex today), in the Citezeno Paper format. */

export type ReaderPaper = Omit<Paper, 'provider' | 'referenceIds' | 'topics'> & { provider: string | null };

export type LoadedPaper = { paper: ReaderPaper; item: ShelfItem | null };

const toReaderPaper = (p: Omit<Paper, 'provider'> & { provider: string | null }): ReaderPaper => ({
  id: p.id,
  provider: p.provider,
  record: p.record,
  doi: p.doi,
  title: p.title,
  authors: p.authors,
  year: p.year,
  publicationDate: p.publicationDate,
  source: p.source,
  type: p.type,
  language: p.language,
  abstract: p.abstract,
  citedByCount: p.citedByCount,
  isOpenAccess: p.isOpenAccess,
  pdfUrl: p.pdfUrl,
  license: p.license ?? null,
  landingUrl: p.landingUrl,
  isRetracted: p.isRetracted,
});

/* A paper ID from the URL, decoded. */
export function readPaperId(raw: string): string {
  let id = raw ?? '';
  try {
    id = decodeURIComponent(id);
  } catch {
    // not encoded
  }
  id = id.trim();
  if (!id || id.length > 300) throw new ReaderError('bad_request', 'That is not a valid paper ID.');
  return id;
}

export async function loadPaper(deps: Pick<ReaderDeps, 'db' | 'sources'>, userId: string, rawId: string): Promise<LoadedPaper> {
  const id = readPaperId(rawId);
  const onShelf = await getItemByPaper(deps.db, userId, id);
  if (onShelf) return { paper: toReaderPaper(onShelf.paper), item: onShelf };
  const target = resolvePaperId(deps.sources(), id);
  if (!target) throw new ReaderError('not_found', 'We couldn’t find that paper.');
  const canonical = qualify(target.source.name, target.id);
  if (canonical !== id) {
    const item = await getItemByPaper(deps.db, userId, canonical);
    if (item) return { paper: toReaderPaper(item.paper), item };
  }
  const { paper } = await getPaper(target);
  return { paper: toReaderPaper(paper), item: null };
}
