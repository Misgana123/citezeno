import 'server-only';
import { papersConfig } from './config';
import { sendSpendAlert } from './guard/alert';
import { createLimiter } from './guard/limiter';
import type { GuardDeps } from './guard/stack';
import { createOpenAlexClient } from './openalex/client';
import { pgCache, pgSlots, pgSpend, pgUsage } from './store/pg';
import type { UsageStore } from './store/types';

/* The server's shared Find Papers pieces. Importing this file from a client
   component fails the build ("server-only"), which keeps the key out of the
   browser. Parked on globalThis so dev reloads reuse one set. */

export type PapersServer = { guard: GuardDeps; usage: UsageStore };

const g = globalThis as unknown as { __czPapers?: PapersServer };

/* Calls OpenAlex at once, at most this many waiting; past that, "busy". */
const CONCURRENCY = 8;
const MAX_QUEUE = 40;

export function papersServer(): PapersServer {
  if (g.__czPapers) return g.__czPapers;
  const config = papersConfig();
  return (g.__czPapers = {
    guard: {
      client: createOpenAlexClient({ config }),
      config,
      cache: pgCache,
      spend: pgSpend,
      slots: pgSlots,
      limiter: createLimiter({ concurrency: CONCURRENCY, maxQueue: MAX_QUEUE }),
      alert: sendSpendAlert,
    },
    usage: pgUsage,
  });
}
