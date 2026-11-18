import 'server-only';
import { randomUUID } from 'node:crypto';
import { pool } from './db';

/* A fixed-window counter in Better Auth's "rateLimit" table, so app endpoints
   are limited the same way and in the same place as the sign-in endpoints.
   Returns false once `max` hits have been counted inside `windowS` seconds. */
export async function allow(key: string, windowS: number, max: number): Promise<boolean> {
  const now = Date.now();
  const { rows } = await pool.query<{ count: number }>(
    `insert into "rateLimit" (id, key, count, "lastRequest") values ($1, $2, 1, $3)
     on conflict (key) do update set
       count = case when $3 - "rateLimit"."lastRequest" > $4 then 1 else "rateLimit".count + 1 end,
       "lastRequest" = case when $3 - "rateLimit"."lastRequest" > $4 then $3 else "rateLimit"."lastRequest" end
     returning count`,
    [randomUUID(), key, now, windowS * 1000],
  );
  return rows[0].count <= max;
}
