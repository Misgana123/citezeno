import 'server-only';
import type { Meter } from '@/lib/providers/gateway/meter';
import type { PaperSources } from '@/lib/providers/papers/sources';
import { paperSourcesFor } from '@/lib/providers/server';
import { papersConfig, type PapersConfig } from './config';
import { papersFacing } from './source';
import { pgUsage } from './store/pg';
import type { UsageStore } from './store/types';

/* The server's shared Find Papers pieces. Importing this file from a client
   component fails the build ("server-only"). Paper data comes from the
   provider registry, through the gateway; this never names a vendor. */

export type PapersServer = { config: PapersConfig; usage: UsageStore; sources(meter: Meter): PaperSources };

export function papersServer(): PapersServer {
  return { config: papersConfig(), usage: pgUsage, sources: (meter) => papersFacing(paperSourcesFor(meter)) };
}
