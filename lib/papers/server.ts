import 'server-only';
import type { Meter } from '@/lib/providers/gateway/meter';
import type { PaperSources } from '@/lib/providers/papers/sources';
import { pool } from '@/lib/db';
import { newMeter } from '@/lib/providers/gateway/meter';
import { paperEnrichersFor, paperSourcesFor } from '@/lib/providers/server';
import { papersConfig, type PapersConfig } from './config';
import { localCopyConfig } from './local/config';
import type { CopyJobDeps } from './local/jobs/runner';
import { pgPaperCopy } from './local/pg';
import { withLocalCopy } from './local/source';
import { papersFacing } from './source';
import { pgUsage } from './store/pg';
import type { UsageStore } from './store/types';

/* The server's shared Find Papers pieces. Importing this file from a client
   component fails the build ("server-only"). Paper data comes from the
   provider registry, through the gateway; this never names a vendor. With
   PAPERS_LOCAL_COPY on, our own copy of papers sits in front of the sources
   (and, with PAPERS_LOCAL_FIRST, is searched first). */

export type PapersServer = { config: PapersConfig; usage: UsageStore; sources(meter: Meter): PaperSources };

const DAY_MS = 86_400_000;

export function papersServer(): PapersServer {
  const config = papersConfig();
  const local = localCopyConfig();
  const sources = (meter: Meter) => {
    const live = paperSourcesFor(meter);
    if (!local.enabled) return papersFacing(live);
    const searchFirst = local.searchFirst ? { minResults: local.minResults } : undefined;
    return papersFacing(withLocalCopy(live, pgPaperCopy(pool), { freshMs: local.freshDays * DAY_MS, searchFirst }));
  };
  return { config, usage: pgUsage, sources };
}

/* What the background jobs that fill our copy of papers need: the live sources
   (not through the copy: the jobs save what they fetch themselves) and the
   fill-in services. */
export function copyJobDeps(): CopyJobDeps {
  return {
    db: pool,
    copy: pgPaperCopy(pool),
    sources: () => papersFacing(paperSourcesFor(newMeter())),
    enrichers: () => paperEnrichersFor(newMeter()),
    config: localCopyConfig(),
  };
}
