import { json } from '@/lib/http';
import { pdfBeginBody } from '@/lib/shelf/api/bodies';
import { pdfDeps } from '@/lib/shelf/api/pdf-deps';
import { shelfRoute } from '@/lib/shelf/route';
import { beginUpload } from '@/lib/shelf/service/pdf-upload';
import { fileStorage } from '@/lib/providers/server';
import { listPdfs, storageUsed } from '@/lib/shelf/store/pdfs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* The user's PDFs and how much storage they use. */
export const GET = shelfRoute(async ({ db, userId, config }) => {
  const [files, used] = await Promise.all([listPdfs(db, userId), storageUsed(db, userId)]);
  return json({ files, usedBytes: used, limitBytes: config.storageBytesPerUser, maxFileBytes: config.pdfMaxBytes, enabled: !!fileStorage() });
});

/* Start an upload: limits are checked and the browser gets a signed form to
   send the file straight to storage. */
export const POST = shelfRoute(async (ctx) => json(await beginUpload(pdfDeps(ctx), ctx.userId, await ctx.body(pdfBeginBody)), 201));
