/* Creates or updates every table Citezeno needs.
   Run with `npm run db:migrate` after setting DATABASE_URL (it reads .env.local).
   Safe to run again: it only adds what is missing. */
import { getMigrations } from 'better-auth/db/migration';
import { authOptions } from '../lib/auth';
import { pool } from '../lib/db';

const APP_SQL = `
create table if not exists trace (
  "userId"   text        not null references "user"(id) on delete cascade,
  id         text        not null,
  title      text        not null,
  style      text        not null,
  mode       text        not null,
  sources    integer     not null default 0,
  snippet    text        not null default '',
  data       jsonb       not null,
  "savedAt"  timestamptz not null default now(),
  primary key ("userId", id)
);
create index if not exists trace_user_saved on trace ("userId", "savedAt" desc);

create table if not exists contact_message (
  id          bigserial   primary key,
  "createdAt" timestamptz not null default now(),
  name        text        not null,
  email       text        not null,
  topic       text        not null,
  message     text        not null,
  "userId"    text        references "user"(id) on delete set null,
  ip          text,
  delivered   boolean     not null default false
);
create index if not exists contact_ip_time on contact_message (ip, "createdAt" desc);

-- Credits. "free" resets to the monthly allowance each calendar month (UTC) and
-- does not roll over; "paid" comes from Polar purchases and never expires.
create table if not exists credit_balance (
  "userId"    text        primary key references "user"(id) on delete cascade,
  free        integer     not null default 0 check (free >= 0),
  paid        integer     not null default 0 check (paid >= 0),
  "freeMonth" text        not null default '',
  "updatedAt" timestamptz not null default now()
);

-- Every change to a balance. "ref" makes webhook grants idempotent.
create table if not exists credit_ledger (
  id          bigserial   primary key,
  "userId"    text        not null references "user"(id) on delete cascade,
  "createdAt" timestamptz not null default now(),
  "freeDelta" integer     not null default 0,
  "paidDelta" integer     not null default 0,
  reason      text        not null,
  ref         text        unique,
  meta        jsonb       not null default '{}'::jsonb,
  refunded    boolean     not null default false
);
create index if not exists credit_ledger_user_time on credit_ledger ("userId", "createdAt" desc);

-- Read-only public links to a trace (v3)
alter table trace add column if not exists "createdAt"   timestamptz not null default now();
alter table trace add column if not exists "shareToken"  text unique;
alter table trace add column if not exists "shareStyle"  text;
alter table trace add column if not exists "shareMode"   text;
alter table trace add column if not exists "shareViews"  integer not null default 0;
alter table trace add column if not exists "titleLocked" boolean not null default false;

-- Admin inbox state (v3)
alter table contact_message add column if not exists handled boolean not null default false;
`;

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL first (in .env.local or the environment).');
  const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(authOptions);
  if (toBeCreated.length || toBeAdded.length) {
    console.log('Auth tables to create:', toBeCreated.map((t) => t.table).join(', ') || 'none');
    console.log('Auth tables to extend:', toBeAdded.map((t) => t.table).join(', ') || 'none');
    await runMigrations();
  } else {
    console.log('Auth tables are up to date.');
  }
  await pool.query(APP_SQL);
  console.log('App tables are up to date (trace, contact_message, credit_balance, credit_ledger, sharing).');
}

main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error(e);
    await pool.end();
    process.exit(1);
  });
