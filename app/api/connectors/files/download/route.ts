import { z } from 'zod';
import { openCapability } from '@/lib/connectors/access';
import { connectorRoute } from '@/lib/connectors/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* The chat's files are read in the browser, as uploads are. */
const MAX_BYTES = 25 * 1024 * 1024;

const OFFICE = /\.(docx?|pptx?|xlsx?|odt|odp|rtf)$/i;

const body = z.object({ fileId: z.string().trim().min(1).max(200), app: z.string().trim().max(40).nullish() });

/* A file picked from the user's connected cloud files, for a chat message:
   its bytes (an editor document as text, a spreadsheet as CSV). */
export const POST = connectorRoute(async (ctx) => {
  const { fileId, app } = await ctx.body(body);
  const { api } = await openCapability(ctx.deps, ctx.userId, 'files', app);
  const meta = await api.get(fileId);
  const editor = meta.kind === 'document' || meta.kind === 'spreadsheet' || meta.kind === 'presentation';
  // Word, Excel and PowerPoint files the chat can't read: as a PDF when the storage can make one
  const office = !editor && OFFICE.test(meta.name);
  const f = editor
    ? await api.download(fileId, { maxBytes: MAX_BYTES, as: 'text' })
    : office
      ? await api.download(fileId, { maxBytes: MAX_BYTES, as: 'pdf' }).catch(() => api.download(fileId, { maxBytes: MAX_BYTES }))
      : await api.download(fileId, { maxBytes: MAX_BYTES });
  return new Response(new Uint8Array(f.bytes), {
    headers: { 'content-type': f.mime || 'application/octet-stream', 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`, 'cache-control': 'no-store' },
  });
});
