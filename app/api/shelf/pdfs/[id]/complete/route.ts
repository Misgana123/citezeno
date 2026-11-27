import { json } from '@/lib/http';
import { pdfDeps } from '@/lib/shelf/api/pdf-deps';
import { shelfRoute } from '@/lib/shelf/route';
import { completeUpload } from '@/lib/shelf/service/pdf-upload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* The browser finished uploading: check and read the file, and suggest which paper it is. */
export const POST = shelfRoute<{ id: string }>(async (ctx, { id }) => json(await completeUpload(pdfDeps(ctx), ctx.userId, id)));
