import { readerRoute } from '@/lib/reader/route';
import { ReaderError } from '@/lib/reader/errors';
import { LINK_TTL_S } from '@/lib/reader/service/open';
import { readPaperId } from '@/lib/reader/service/paper';
import { checkFileLink } from '@/lib/reader/sign';
import { getSharedText, markFailed } from '@/lib/reader/store/texts';
import { isProviderError } from '@/lib/providers/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type P = { paperId: string };

/* An open-access PDF we may not store, fetched fresh from its source and
   streamed to the reader. Only through a short-lived link signed for this
   user and paper. A stored shared copy is served from storage instead. */
export const GET = readerRoute<P>(async ({ req, userId, deps }, { paperId }) => {
  const id = readPaperId(paperId);
  const q = new URL(req.url).searchParams;
  if (!checkFileLink(userId, id, Number(q.get('exp')), q.get('sig') ?? '')) throw new ReaderError('not_found', 'This link has expired. Reopen the paper.');
  const text = await getSharedText(deps.db, id);
  if (!text?.sourceUrl) throw new ReaderError('no_pdf', 'This paper has no free PDF.');
  if (text.storageKey && deps.store) {
    return new Response(null, { status: 302, headers: { location: deps.store.downloadUrl(text.storageKey, { ttlS: LINK_TTL_S, inline: true }), 'cache-control': 'no-store' } });
  }
  try {
    const file = await deps.web().fetchPdf(text.sourceUrl, { maxBytes: deps.maxPdfBytes });
    return new Response(file.stream, {
      headers: {
        'content-type': 'application/pdf',
        ...(file.size ? { 'content-length': String(file.size) } : {}),
        'content-disposition': 'inline',
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (e) {
    const reason = isProviderError(e) ? e.details.reason : undefined;
    if (reason === 'not_pdf' || reason === 'not_found' || reason === 'blocked' || reason === 'too_large') await markFailed(deps.db, text.id, `download:${reason}`, true);
    throw new ReaderError('no_pdf', 'We couldn’t load the free PDF.', { reason: reason ?? 'unavailable' });
  }
});
