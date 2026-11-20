import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const runtime = 'nodejs';

/* PDF.js's worker, served from our own origin for the reader page (the
   library itself is kept out of the bundles, see next.config.mjs, which also
   ships this file with the route). The file changes only with the pinned
   pdfjs-dist version, which is in the URL. */
const FILE = join(process.cwd(), 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
let cached: Promise<Buffer> | null = null;

export async function GET() {
  try {
    const body = await (cached ??= readFile(FILE));
    return new Response(new Uint8Array(body), {
      headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' },
    });
  } catch (e) {
    console.error('[citezeno] reader: the PDF.js worker file is missing', e);
    cached = null;
    return new Response('Not found', { status: 404 });
  }
}
