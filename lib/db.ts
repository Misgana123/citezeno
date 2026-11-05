import { Pool } from 'pg';

/* One Postgres pool per server instance. In development the module is reloaded
   on every change, so the pool is parked on globalThis to avoid leaking
   connections. */
const g = globalThis as unknown as { __czPool?: Pool };

function create() {
  // Creating a pool does not connect, so a missing URL only fails on the first
  // query. That keeps `next build` working before the database is set up.
  // pg treats sslmode=require as verify-full (and warns about it on every
  // start). Say verify-full explicitly: same behaviour, no warning.
  const url = (process.env.DATABASE_URL || '').replace(/([?&]sslmode=)(require|prefer|verify-ca)(?=&|$)/, '$1verify-full');
  if (!url && process.env.NODE_ENV !== 'test') console.warn('[citezeno] DATABASE_URL is not set. Accounts and the contact form will not work.');
  const local = !url || /localhost|127\.0\.0\.1/.test(url);
  return new Pool({
    connectionString: url,
    // with an sslmode in the URL, pg follows it; otherwise encrypt without pinning the certificate
    ssl: local || /[?&]sslmode=/.test(url) ? undefined : { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 10_000,
  });
}

export const pool: Pool = g.__czPool ?? (g.__czPool = create());
