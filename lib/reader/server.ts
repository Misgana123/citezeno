import 'server-only';
import { createMeter } from '@/lib/credits/meter';
import { wallet } from '@/lib/credits/server';
import { pool } from '@/lib/db';
import { papersServer } from '@/lib/papers/server';
import { newMeter } from '@/lib/providers/gateway/meter';
import { chatModelsFor, embedderFor, fileStorage, pdfPagesReader, webFiles } from '@/lib/providers/server';
import { readerConfig, readerModels } from './config';
import type { ReaderDeps } from './deps';

/* The server's reader pieces, from configuration. Importing this from a client
   component fails the build ("server-only"). Every outside service comes from
   the provider registry, through the gateway; this never names a vendor. */

export function readerDeps(): ReaderDeps {
  const config = readerConfig();
  let embedder: ReturnType<typeof embedderFor> | undefined;
  return {
    db: pool,
    store: fileStorage(),
    web: () => webFiles(),
    pages: () => pdfPagesReader(),
    embedder: () => (embedder === undefined ? (embedder = embedderFor()) : embedder),
    sources: () => papersServer().sources(newMeter()),
    chat: () => chatModelsFor(),
    maxPdfBytes: config.maxPdfBytes,
    // one action per text, so an upload is charged once however many runs it takes; re-embedding later is free
    embedMeter: (t) => createMeter(wallet(), { userId: t.userId, kind: 'reader.embed', actionId: `embed:${t.textId}`, ttlMs: 60 * 60 * 1000, meta: { paperId: t.paperId } }),
  };
}

/* Whether AI (summaries, questions, Explain) is set up: some chat model has a key. */
export const aiAvailable = async () => readerModels(await chatModelsFor(), readerConfig()) != null;
