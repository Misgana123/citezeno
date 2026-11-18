import { PapersError } from '../errors';
import type { QueryParams } from '../openalex/client';
import type { SlotStore } from '../store/types';
import { callKind, type Layer } from './call';

/* OpenAlex allows one semantic search per second per key, across all our
   users and server instances. Each semantic call reserves the next shared
   slot and waits for it; when the next free slot is too far off, the user
   gets "busy" instead of a long wait. */

export const SEMANTIC_INTERVAL_MS = 1100; // 1 per second, with a little margin
export const MAX_SLOT_WAIT_MS = 6000;

export type Sleep = (ms: number) => Promise<void>;
export const sleep: Sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

export const withPacing =
  (slots: SlotStore, opts: { intervalMs?: number; maxWaitMs?: number; now?: () => number; sleep?: Sleep } = {}): Layer =>
  (inner) => ({
    async get<T>(path: string, params: QueryParams = {}) {
      if (callKind(path, params) === 'semantic') {
        const wait = await slots.reserve('semantic', opts.intervalMs ?? SEMANTIC_INTERVAL_MS, opts.maxWaitMs ?? MAX_SLOT_WAIT_MS, (opts.now ?? Date.now)());
        if (wait == null) throw new PapersError('busy', 'Too many semantic searches queued.', { reason: 'semantic_queue' });
        if (wait > 0) await (opts.sleep ?? sleep)(wait);
      }
      return inner.get<T>(path, params);
    },
  });
