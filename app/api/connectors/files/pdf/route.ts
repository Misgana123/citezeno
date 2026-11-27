import { z } from 'zod';
import { json } from '@/lib/http';
import { connectorErrorResponse } from '@/lib/connectors/route';
import { connectorDeps } from '@/lib/connectors/server';
import { cloudFileToShelf } from '@/lib/connectors/service/file-to-shelf';
import { pdfDeps } from '@/lib/shelf/api/pdf-deps';
import { shelfRoute } from '@/lib/shelf/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const body = z.object({ fileId: z.string().trim().min(1).max(200), itemId: z.string().min(1).max(80).nullish() });

/* A PDF picked from the user's connected cloud files, onto their shelf. The
   answer is the same as a finished upload's (the paper it seems to be). */
export const POST = shelfRoute(async (ctx) => {
  const f = await ctx.body(body);
  try {
    return json(await cloudFileToShelf(connectorDeps(), pdfDeps(ctx), ctx.userId, f), 201);
  } catch (e) {
    return connectorErrorResponse(e);
  }
});
