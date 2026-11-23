import { isProviderError } from '../errors';
import type { GatewayPolicy, Layer } from './types';

/* Counts of what the gateway did, per provider and hour, for the admin page:
   answers reused, calls sent and how they went, callers who waited and for how
   long, callers turned away, pauses. Counted in memory and written in batches
   every few seconds, so counting costs a request nothing. Totals only: no
   users, no search text. */

export type StatName =
  | 'cache_hit' // answered from the cache
  | 'cache_miss' // not in the cache: went on to the provider (or a shared call)
  | 'cache_stale' // provider failed; an expired answer stood in
  | 'shared' // joined the same call already on its way
  | 'call' // reached the provider (totalMs: time taken)
  | 'call_error' // …and failed
  | 'rate_limited' // …with a 429 from the provider
  | 'waited' // waited for its turn in the line (totalMs: time waited)
  | 'turned_away' // our own line was too long: "busy"
  | 'budget_stop' // refused: the daily spending cap was reached
  | 'paused' // the breaker opened
  | 'paused_refused'; // refused while paused

export type StatRow = { hour: string; provider: string; name: StatName; count: number; totalMs: number };

export interface StatsStore {
  add(rows: StatRow[]): Promise<void>;
}

export type Stats = { add(provider: string, name: StatName, ms?: number): void };

export const noStats: Stats = { add() {} };

/* "2026-11-23T14": the UTC hour a count belongs to. */
export const statHour = (now: number) => new Date(now).toISOString().slice(0, 13);

export const FLUSH_MS = 5000;

export function statsCollector(store: StatsStore, opts: { now?: () => number; flushMs?: number } = {}): Stats & { flush(): Promise<void> } {
  const now = opts.now ?? Date.now;
  const flushMs = opts.flushMs ?? FLUSH_MS;
  let rows = new Map<string, StatRow>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function flush() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!rows.size) return;
    const batch = [...rows.values()];
    rows = new Map();
    try {
      await store.add(batch);
    } catch (e) {
      console.warn('[citezeno] provider stats: write failed', (e as Error)?.message ?? e);
    }
  }

  return {
    add(provider, name, ms = 0) {
      const hour = statHour(now());
      const key = `${hour}|${provider}|${name}`;
      const row = rows.get(key) ?? { hour, provider, name, count: 0, totalMs: 0 };
      row.count++;
      row.totalMs += ms;
      rows.set(key, row);
      if (!timer) {
        timer = setTimeout(() => void flush(), flushMs);
        timer.unref?.(); // never keeps a process alive
      }
    },
    flush,
  };
}

/* Our own refusals, by the reason the gateway layers give. */
const TURNED_AWAY = new Set(['rate_queue', 'semantic_queue', 'queue_full']);

/* Placed just above the budget: how each caller's call ended when the gateway itself said no. */
export const withRefusalStats =
  <Req>(stats: Stats, policy: Pick<GatewayPolicy<Req>, 'provider'>): Layer<Req> =>
  (inner) => ({
    async call<T>(req: Req) {
      try {
        return await inner.call<T>(req);
      } catch (e) {
        const reason = isProviderError(e) ? e.details.reason : undefined;
        if (reason && TURNED_AWAY.has(reason)) stats.add(policy.provider, 'turned_away');
        else if (reason === 'daily_cap') stats.add(policy.provider, 'budget_stop');
        else if (reason === 'breaker_open') stats.add(policy.provider, 'paused_refused');
        throw e;
      }
    },
  });

/* Placed just above the transport: every call that really reached the provider. */
export const withCallStats =
  <Req>(stats: Stats, policy: Pick<GatewayPolicy<Req>, 'provider'>, now: () => number = Date.now): Layer<Req> =>
  (inner) => ({
    async call<T>(req: Req) {
      const start = now();
      try {
        return await inner.call<T>(req);
      } catch (e) {
        stats.add(policy.provider, 'call_error');
        if (isProviderError(e) && e.details.status === 429) stats.add(policy.provider, 'rate_limited');
        throw e;
      } finally {
        stats.add(policy.provider, 'call', now() - start);
      }
    },
  });
