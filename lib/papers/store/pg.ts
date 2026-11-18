import 'server-only';
import { pool } from '@/lib/db';
import type { CacheStore, SlotStore, SpendStore, UsageStore } from './types';

/* Postgres stores (tables created by `npm run db:migrate`: papers_cache,
   papers_spend, papers_usage, papers_slot). Shared by every server instance. */

export const pgCache: CacheStore = {
  async get(key) {
    const { rows } = await pool.query<{ value: unknown }>(`select value from papers_cache where key = $1 and "expiresAt" > now()`, [key]);
    return rows[0]?.value ?? null;
  },
  async set(key, value, ttlS) {
    await pool.query(
      `insert into papers_cache (key, value, "expiresAt") values ($1, $2, now() + make_interval(secs => $3))
       on conflict (key) do update set value = excluded.value, "expiresAt" = excluded."expiresAt"`,
      [key, JSON.stringify(value), ttlS],
    );
    // now and then, clear out expired entries
    if (Math.random() < 0.02) await pool.query(`delete from papers_cache where "expiresAt" < now()`);
  },
};

export const pgSpend: SpendStore = {
  async spent(day) {
    const { rows } = await pool.query<{ usd: number }>(`select usd from papers_spend where day = $1`, [day]);
    return Number(rows[0]?.usd ?? 0);
  },
  async add(day, usd, search) {
    const { rows } = await pool.query<{ usd: number }>(
      `insert into papers_spend (day, usd, calls, searches) values ($1, $2, 1, $3)
       on conflict (day) do update set usd = papers_spend.usd + $2, calls = papers_spend.calls + 1, searches = papers_spend.searches + $3
       returning usd`,
      [day, usd, search ? 1 : 0],
    );
    const after = Number(rows[0].usd);
    return { before: after - usd, after };
  },
  async claimAlert(day, kind) {
    const col = kind === 'alert' ? '"alertedAt"' : '"cappedAt"';
    const { rowCount } = await pool.query(`update papers_spend set ${col} = now() where day = $1 and ${col} is null`, [day]);
    return (rowCount ?? 0) > 0;
  },
};

export const pgUsage: UsageStore = {
  async reserve(userId, day, n, limit) {
    if (n > limit) return null;
    const { rows } = await pool.query<{ searches: number }>(
      `insert into papers_usage ("userId", day, searches) values ($1, $2, $3)
       on conflict ("userId", day) do update set searches = papers_usage.searches + $3
       where papers_usage.searches + $3 <= $4
       returning searches`,
      [userId, day, n, limit],
    );
    return rows[0]?.searches ?? null;
  },
  async refund(userId, day, n) {
    await pool.query(`update papers_usage set searches = greatest(0, searches - $3) where "userId" = $1 and day = $2`, [userId, day, n]);
  },
  async used(userId, day) {
    const { rows } = await pool.query<{ searches: number }>(`select searches from papers_usage where "userId" = $1 and day = $2`, [userId, day]);
    return rows[0]?.searches ?? 0;
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
