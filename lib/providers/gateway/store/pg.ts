import 'server-only';
import { pool } from '@/lib/db';
import type { StatRow, StatsStore } from '../stats';
import type { CacheStore, SlotStore, SpendStore } from './types';

/* Postgres gateway stores (tables created by `npm run db:migrate`):
   papers_cache and papers_slot (named from when OpenAlex was the only
   provider; keys now start with the provider's name), provider_spend and
   provider_stats. Shared by every server instance. */

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
  async calls(provider, day) {
    const { rows } = await pool.query<{ calls: number }>(`select calls from provider_spend where provider = $1 and day = $2`, [provider, day]);
    return Number(rows[0]?.calls ?? 0);
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

/* Hourly counts for the admin page; kept 30 days. */
export const STATS_KEEP_DAYS = 30;

export const pgStats: StatsStore = {
  async add(rows: StatRow[]) {
    if (!rows.length) return;
    await pool.query(
      `insert into provider_stats (hour, provider, name, count, "totalMs")
       select * from unnest($1::text[], $2::text[], $3::text[], $4::bigint[], $5::double precision[])
       on conflict (hour, provider, name) do update set count = provider_stats.count + excluded.count, "totalMs" = provider_stats."totalMs" + excluded."totalMs"`,
      [rows.map((r) => r.hour), rows.map((r) => r.provider), rows.map((r) => r.name), rows.map((r) => r.count), rows.map((r) => r.totalMs)],
    );
    // now and then, forget old hours
    if (Math.random() < 0.01) await pool.query(`delete from provider_stats where hour < to_char(now() at time zone 'utc' - make_interval(days => $1), 'YYYY-MM-DD"T"HH24')`, [STATS_KEEP_DAYS]);
  },
};

/* Per provider, the counts since `hours` ago (for the admin page). */
export async function providerStatsSince(hours: number): Promise<Map<string, Map<string, { count: number; totalMs: number }>>> {
  const { rows } = await pool.query<{ provider: string; name: string; count: string; totalMs: number }>(
    `select provider, name, sum(count) as count, sum("totalMs") as "totalMs" from provider_stats
     where hour >= to_char(now() at time zone 'utc' - make_interval(hours => $1), 'YYYY-MM-DD"T"HH24')
     group by provider, name`,
    [hours],
  );
  const out = new Map<string, Map<string, { count: number; totalMs: number }>>();
  for (const r of rows) {
    if (!out.has(r.provider)) out.set(r.provider, new Map());
    out.get(r.provider)!.set(r.name, { count: Number(r.count), totalMs: Number(r.totalMs) });
  }
  return out;
}
