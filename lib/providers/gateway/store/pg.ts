import 'server-only';
import { pool } from '@/lib/db';
import type { CacheStore, SlotStore, SpendStore } from './types';

/* Postgres gateway stores (tables created by `npm run db:migrate`):
   papers_cache and papers_slot (named from when OpenAlex was the only
   provider; keys now start with the provider's name) and provider_spend.
   Shared by every server instance. */

/* "staleUntil" (null on rows from before it existed) is when an expired entry is finally dropped. */
export const pgCache: CacheStore = {
  async get(key) {
    const { rows } = await pool.query<{ value: unknown }>(`select value from papers_cache where key = $1 and "expiresAt" > now()`, [key]);
    return rows[0]?.value ?? null;
  },
  async getStale(key) {
    const { rows } = await pool.query<{ value: unknown }>(`select value from papers_cache where key = $1 and coalesce("staleUntil", "expiresAt") > now()`, [key]);
    return rows[0]?.value ?? null;
  },
  async set(key, value, ttlS, staleS = 0) {
    await pool.query(
      `insert into papers_cache (key, value, "expiresAt", "staleUntil") values ($1, $2, now() + make_interval(secs => $3), now() + make_interval(secs => $3 + $4))
       on conflict (key) do update set value = excluded.value, "expiresAt" = excluded."expiresAt", "staleUntil" = excluded."staleUntil"`,
      [key, JSON.stringify(value), ttlS, Math.max(0, staleS)],
    );
    // now and then, clear out entries no longer kept
    if (Math.random() < 0.02) await pool.query(`delete from papers_cache where coalesce("staleUntil", "expiresAt") < now()`);
  },
};

export const pgSpend: SpendStore = {
  async spent(provider, day) {
    const { rows } = await pool.query<{ usd: number }>(`select usd from provider_spend where provider = $1 and day = $2`, [provider, day]);
    return Number(rows[0]?.usd ?? 0);
  },
  async add(provider, day, usd, search) {
    const { rows } = await pool.query<{ usd: number }>(
      `insert into provider_spend (provider, day, usd, calls, searches) values ($1, $2, $3, 1, $4)
       on conflict (provider, day) do update set usd = provider_spend.usd + $3, calls = provider_spend.calls + 1, searches = provider_spend.searches + $4
       returning usd`,
      [provider, day, usd, search ? 1 : 0],
    );
    const after = Number(rows[0].usd);
    return { before: after - usd, after };
  },
  async claimAlert(provider, day, kind) {
    const col = kind === 'alert' ? '"alertedAt"' : '"cappedAt"';
    const { rowCount } = await pool.query(`update provider_spend set ${col} = now() where provider = $1 and day = $2 and ${col} is null`, [provider, day]);
    return (rowCount ?? 0) > 0;
  },
};

export const pgSlots: SlotStore = {
  async reserve(key, intervalMs, maxWaitMs, now) {
    const { rows } = await pool.query<{ slot: string }>(
      `insert into papers_slot (key, "nextAt") values ($1, $2::bigint + $3::bigint)
       on conflict (key) do update set "nextAt" = greatest(papers_slot."nextAt", $2::bigint) + $3::bigint
       where greatest(papers_slot."nextAt", $2::bigint) - $2::bigint <= $4::bigint
       returning "nextAt" - $3::bigint as slot`,
      [key, now, intervalMs, maxWaitMs],
    );
    return rows[0] ? Math.max(0, Number(rows[0].slot) - now) : null;
  },
};
