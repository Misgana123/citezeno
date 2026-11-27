import { json } from '@/lib/http';
import { pdfParam, readerRoute } from '@/lib/reader/route';
import { textState } from '@/lib/reader/service/open';
import { readableText } from '@/lib/reader/service/text';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type P = { paperId: string };

/* How far the paper's text processing is (polled while it is being prepared). */
export const GET = readerRoute<P>(async ({ req, userId, deps }, { paperId }) => {
  const { text } = await readableText(deps, userId, paperId, { pdfId: pdfParam(req) });
  const emb = deps.embedder();
  return json({ text: text ? textState(text, emb ? { model: emb.model.id, dims: emb.dimensions } : null) : null });
});
