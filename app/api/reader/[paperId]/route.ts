import { after } from 'next/server';
import { pdfParam, readerRoute } from '@/lib/reader/route';
import { aiAvailable } from '@/lib/reader/server';
import { openPaper } from '@/lib/reader/service/open';
import { processNext } from '@/lib/reader/service/process';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type P = { paperId: string };

/* Open a paper: its details, the PDF to show (through a short-lived link), how
   far its text processing is, and where the user stopped. Text that still
   needs work starts right away, after the answer is sent. */
export const GET = readerRoute<P>(async ({ req, userId, deps }, { paperId }) => {
  const { view, needsWork } = await openPaper(deps, userId, paperId, { pdfId: pdfParam(req) });
  if (needsWork) after(() => processNext(deps, { id: needsWork, deadline: Date.now() + 50_000 }).catch(() => {}));
  return Response.json({ ...view, ai: aiAvailable() }, { headers: { 'cache-control': 'no-store' } });
});

