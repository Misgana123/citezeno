import 'server-only';
import { papersServer } from '@/lib/papers/server';
import { newMeter } from '@/lib/providers/gateway/meter';
import type { PaperSource } from '@/lib/providers/papers/types';

/* The primary paper source, through the gateway (cache, limiter, cost log,
   daily cap), for work that runs outside a user's request. */
export const backgroundPapers = (): PaperSource => papersServer().sources(newMeter()).primary;
