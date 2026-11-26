import { z } from 'zod';
import { askPaper, type AskEvent } from '@/lib/reader/ai/ask';
import { isReaderError } from '@/lib/reader/errors';
import { InsufficientCredits } from '@/lib/credits/errors';
import { metered, pdfParam, readerRoute } from '@/lib/reader/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type P = { paperId: string };

const body = z.object({
  kind: z.enum(['ask', 'explain']).default('ask'),
  question: z.string().max(2000).default(''),
  quote: z.string().max(4000).nullish(),
  page: z.number().int().min(1).max(100_000).nullish(),
  chatId: z.string().max(80).nullish(),
});

/* Ask the paper (or Explain a selection): the answer streams back as one JSON
   event per line — chat, text pieces (each sentence already checked), done. */
export const POST = readerRoute<P>(async (ctx, { paperId }) => {
  const { req, userId } = ctx;
  const input = await ctx.body(body);
  const m = metered(ctx, input.kind === 'explain' ? 'reader.explain' : 'reader.ask', { paperId });
  const deps = m.deps;
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  let open = true;
  req.signal?.addEventListener('abort', () => (open = false));
  const emit = (e: AskEvent) => {
    if (open) writer.write(encoder.encode(`${JSON.stringify(e)}\n`)).catch(() => (open = false));
  };
  void (async () => {
    let ok = false;
    try {
      await askPaper(deps, userId, paperId, { ...input, pdfId: pdfParam(req) }, emit);
      ok = true;
    } catch (e) {
      if (e instanceof InsufficientCredits) emit({ type: 'error', message: e.message, code: 'insufficient_credits' });
      else if (isReaderError(e)) emit({ type: 'error', message: e.message, code: e.code });
      else {
        console.error('[citezeno] reader: answer failed', e);
        emit({ type: 'error', message: 'Something went wrong. Please try again.', code: 'unavailable' });
      }
    } finally {
      await m.finish(ok);
      open = false;
      await writer.close().catch(() => {});
    }
  })();
  return new Response(readable, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
});
