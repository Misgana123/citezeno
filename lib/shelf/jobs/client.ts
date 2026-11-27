import 'server-only';
import { papersServer } from '@/lib/papers/server';
import { newMeter } from '@/lib/providers/gateway/meter';
import type { PaperSources } from '@/lib/providers/papers/sources';

/* The enabled paper sources, through the gateway (cache, limiter, cost log,
   daily cap), for work that runs outside a user's request. */
export const backgroundSources = (): PaperSources => papersServer().sources(newMeter());
