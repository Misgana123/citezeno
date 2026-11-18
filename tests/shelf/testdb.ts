import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { SHELF_SQL } from '@/lib/shelf/schema';

/* A throwaway Postgres schema for the Shelf store tests, so they run the real
   SQL without touching the app's tables. Set TEST_DATABASE_URL to run them
   (for example the local database from .env.local); without it they are skipped. */

export const TEST_DB_URL = process.env.TEST_DATABASE_URL?.trim() || '';

export type TestDb = { pool: Pool; addUser(id?: string): Promise<string>; close(): Promise<void> };

export async function openTestDb(): Promise<TestDb> {
  const schema = `shelf_test_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const admin = new Pool({ connectionString: TEST_DB_URL, max: 1 });
  await admin.query(`create schema ${schema}`);
  await admin.end();
  const pool = new Pool({ connectionString: TEST_DB_URL, max: 4, options: `-c search_path=${schema}` });
  // the app's "user" table, reduced to what the foreign keys need
  await pool.query(`create table "user" (id text primary key)`);
  await pool.query(SHELF_SQL);
  return {
    pool,
    async addUser(id = `u_${randomUUID()}`) {
      await pool.query(`insert into "user" (id) values ($1)`, [id]);
      return id;
    },
    async close() {
      await pool.query(`drop schema ${schema} cascade`);
      await pool.end();
    },
  };
}
