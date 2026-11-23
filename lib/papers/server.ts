import 'server-only';
import type { Meter } from '@/lib/providers/gateway/meter';
import type { PaperSources } from '@/lib/providers/papers/sources';
import { pool } from '@/lib/db';
import { paperSourcesFor } from '@/lib/providers/server';
import { papersConfig, type PapersConfig } from './config';
import { localCopyConfig } from './local/config';
import { pgPaperCopy } from './local/pg';
import { withLocalCopy } from './local/source';
import { papersFacing } from './source';
import { pgUsage } from './store/pg';
import type { UsageStore } from './store/types';

/* The server's shared Find Papers pieces. Importing this file from a client
   component fails the build ("server-only"). Paper data comes from the
   provider registry, through the gateway; this never names a vendor. With
   PAPERS_LOCAL_COPY on, our own copy of papers sits in front of the sources. */

export type PapersServer = { config: PapersConfig; usage: UsageStore; sources(meter: Meter): PaperSources };

const DAY_MS = 86_400_000;

export function papersServer(): PapersServer {
  const config = papersConfig();
  const local = localCopyConfig();
  const sources = (meter: Meter) => {
    const live = paperSourcesFor(meter);
    return papersFacing(local.enabled ? withLocalCopy(live, pgPaperCopy(pool), { freshMs: local.freshDays * DAY_MS }) : live);
  };
  return { config, usage: pgUsage, sources };
}
