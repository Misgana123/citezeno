import { after } from 'next/server';
import { json } from '@/lib/http';
import { ReaderError } from '@/lib/reader/errors';
import { pdfParam, readerRoute } from '@/lib/reader/route';
import { processNext } from '@/lib/reader/service/process';
import { readableText } from '@/lib/reader/service/text';
import { retryText } from '@/lib/reader/store/texts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type P = { paperId: string };

/* "Try again" after the paper's text couldn't be read or its PDF fetched. */
export const POST = readerRoute<P>(async ({ req, userId, deps }, { paperId }) => {
  const { text } = await readableText(deps, userId, paperId, { pdfId: pdfParam(req) });
  if (!text) throw new ReaderError('no_pdf', 'This paper has no PDF to read.');
  await retryText(deps.db, text.id);
  after(() => processNext(deps, { id: text.id, deadline: Date.now() + 50_000 }).catch(() => {}));
  return json({ ok: true });
});
