import { z } from 'zod';
import { json } from '@/lib/http';
import { explainSelection } from '@/lib/reader/ai/explain';
import { charged, pdfParam, readerRoute } from '@/lib/reader/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type P = { paperId: string };

const body = z.object({ quote: z.string().trim().min(1, 'Select some text to explain.').max(4000), page: z.number().int().min(1).max(100_000) });

/* Explain a selected passage simply. */
export const POST = readerRoute<P>(async (ctx, { paperId }) => {
  const sel = await ctx.body(body);
  return json(await charged(ctx, 'reader.explain', { paperId }, (deps) => explainSelection(deps, ctx.userId, paperId, { ...sel, pdfId: pdfParam(ctx.req) })));
});
