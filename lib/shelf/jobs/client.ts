import 'server-only';
import { newMeter } from '@/lib/papers/guard/meter';
import { guardedClient } from '@/lib/papers/guard/stack';
import type { OpenAlexClient } from '@/lib/papers/openalex/client';
import { papersServer } from '@/lib/papers/server';

/* Find Papers' guarded OpenAlex client (cache, limiter, cost log, daily cap)
   for work that runs outside a user's request. */
export const backgroundClient = (): OpenAlexClient => guardedClient(papersServer().guard, newMeter());
