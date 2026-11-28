import 'server-only';
import { accountPayer } from '@/lib/labs/chat';
import { createMeter } from '@/lib/credits/meter';
import { planLimits } from '@/lib/credits/limits';
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
    // a lab's PDF (held by its shelf account) is paid for by the lab's owner
    embedMeter: async (t) => {
      const payer = await accountPayer(pool, t.userId);
      return createMeter(wallet(), { userId: payer, kind: 'reader.embed', actionId: `embed:${t.textId}`, ttlMs: 60 * 60 * 1000, meta: { paperId: t.paperId, ...(payer !== t.userId ? { labShelf: t.userId } : {}) } });
    },
    // uploads embedded this calendar month (UTC), against the plan; one already started (or embedded before) always goes ahead
    embedAllowed: async (account, textId) => {
      const userId = await accountPayer(pool, account);
      const { rows } = await pool.query<{ mine: boolean; n: number }>(
        `select exists (select 1 from credit_action where id = $2 and "userId" = $1) as mine,
                (select count(*)::int from credit_action where "userId" = $1 and kind = 'reader.embed' and id <> $2 and (charged > 0 or status = 'held')
                   and "createdAt" >= date_trunc('month', now() at time zone 'utc') at time zone 'utc') as n`,
        [userId, `embed:${textId}`],
      );
      return Boolean(rows[0]?.mine) || (rows[0]?.n ?? 0) < (await planLimits(userId)).embedsPerMonth;
    },
  };
}

/* Whether AI (summaries, questions, Explain) is set up: some chat model has a key. */
export const aiAvailable = async () => readerModels(await chatModelsFor(), readerConfig()) != null;
