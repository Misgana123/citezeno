import { json } from '@/lib/http';
import { pdfParam, readerRoute } from '@/lib/reader/route';
import { readableText } from '@/lib/reader/service/text';
import { listPassages } from '@/lib/reader/store/passages';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type P = { paperId: string };

/* The paper's passages (for citation links in summaries and answers): empty
   until its text is ready. */
export const GET = readerRoute<P>(async ({ req, userId, deps }, { paperId }) => {
  const { text } = await readableText(deps, userId, paperId, { pdfId: pdfParam(req) });
  if (!text || text.status !== 'ready') return json({ status: text?.status ?? null, passages: [] });
  return json({ status: text.status, passages: await listPassages(deps.db, text.id) });
});
