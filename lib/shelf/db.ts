import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

/* What the Shelf stores need from Postgres. Taking it as a parameter (instead
   of importing the app's pool) lets tests run the same SQL in a throwaway schema. */
export type Queryable = { query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>> };
export type Db = Queryable & Pick<Pool, 'connect'>;

/* Run fn inside one transaction; rolled back if it throws. */
export async function tx<T>(db: Db, fn: (q: Queryable) => Promise<T>): Promise<T> {
  const client: PoolClient = await db.connect();
  try {
    await client.query('begin');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export const iso = (v: Date | string | null | undefined): string | null => (v == null ? null : new Date(v).toISOString());
