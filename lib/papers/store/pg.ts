import 'server-only';
import { pool } from '@/lib/db';
import type { UsageStore } from './types';

/* The Postgres usage store (table papers_usage, created by `npm run db:migrate`). */
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
