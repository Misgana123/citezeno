import { json } from '@/lib/http';
import { savedSummary, summarize } from '@/lib/reader/ai/summary';
import { charged, pdfParam, readerRoute } from '@/lib/reader/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type P = { paperId: string };

/* The saved summary, if there is one (no AI call). */
export const GET = readerRoute<P>(async ({ req, userId, deps }, { paperId }) => {
  const { summary } = await savedSummary(deps, userId, paperId, { pdfId: pdfParam(req) });
  return json({ summary });
});

/* Get or make the summary (made once, then reused: a saved one costs nothing). */
export const POST = readerRoute<P>(async (ctx, { paperId }) =>
  json(await charged(ctx, 'reader.summary', { paperId }, (deps) => summarize(deps, ctx.userId, paperId, { pdfId: pdfParam(ctx.req) }))),
);
