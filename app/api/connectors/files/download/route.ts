import { z } from 'zod';
import { openCapability } from '@/lib/connectors/access';
import { connectorRoute } from '@/lib/connectors/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* The chat's files are read in the browser, as uploads are. */
const MAX_BYTES = 25 * 1024 * 1024;

const body = z.object({ fileId: z.string().trim().min(1).max(200) });

/* A file picked from the user's connected cloud files, for a chat message:
   its bytes (an editor document as text, a spreadsheet as CSV). */
export const POST = connectorRoute(async (ctx) => {
  const { fileId } = await ctx.body(body);
  const { api } = await openCapability(ctx.deps, ctx.userId, 'files');
  const meta = await api.get(fileId);
  const editor = meta.kind === 'document' || meta.kind === 'spreadsheet' || meta.kind === 'presentation';
  const f = await api.download(fileId, { maxBytes: MAX_BYTES, ...(editor ? { as: 'text' as const } : {}) });
  return new Response(new Uint8Array(f.bytes), {
    headers: { 'content-type': f.mime || 'application/octet-stream', 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`, 'cache-control': 'no-store' },
  });
});
