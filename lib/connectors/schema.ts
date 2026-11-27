/* Connected apps (lib/connectors), run by `npm run db:migrate` (and by the
   tests, in a throwaway schema). Safe to run again.

   "secret" holds the user's tokens or key, sealed with CONNECTORS_SECRET
   (lib/connectors/crypto.ts): never readable from the database alone. Rows go
   with the account. */
export const CONNECTORS_SQL = `
create table if not exists connector_account (
  "userId"     text        not null references "user"(id) on delete cascade,
  connector    text        not null,
  "accountId"  text        not null,
  label        text        not null,
  secret       text        not null,
  scopes       text[]      not null default '{}',
  "expiresAt"  timestamptz,
  status       text        not null default 'ok' check (status in ('ok', 'needs_reconnect')),
  "createdAt"  timestamptz not null default now(),
  "updatedAt"  timestamptz not null default now(),
  primary key ("userId", connector)
);

-- How far "Sync now" got, per library or collection: the reference manager's
-- library version, so the next sync asks only for what changed since.
create table if not exists connector_sync (
  "userId"    text        not null references "user"(id) on delete cascade,
  connector   text        not null,
  scope       text        not null,
  version     bigint      not null default 0,
  "projectId" text,
  "syncedAt"  timestamptz,
  primary key ("userId", connector, scope)
);
`;
