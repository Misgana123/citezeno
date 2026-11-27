import { readerRoute } from '@/lib/reader/route';
import { exportFor } from '@/lib/reader/service/annotations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type P = { paperId: string };

/* Every highlight and note on the paper, with page numbers: ?format=md (Markdown) or txt. */
export const GET = readerRoute<P>(async ({ req, userId, deps }, { paperId }) => {
  const format = new URL(req.url).searchParams.get('format') === 'txt' ? 'txt' : 'md';
  const { text, fileName } = await exportFor(deps, userId, paperId, format);
  return new Response(text, {
    headers: {
      'content-type': format === 'md' ? 'text/markdown; charset=utf-8' : 'text/plain; charset=utf-8',
      'content-disposition': `attachment; filename="${fileName.replace(/[^\x20-\x7e]|"/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'cache-control': 'no-store',
    },
  });
});
