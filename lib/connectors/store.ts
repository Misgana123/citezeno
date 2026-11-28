import type { Credentials } from '@/lib/providers/connectors/types';
import { iso, type Queryable } from '@/lib/shelf/db';
import { seal, unseal, type ConnectorKeys } from './crypto';
import type { Permission } from './permissions';

/* connector_account: one connection per user and app. The tokens or key stay
   sealed; only `secretFor` opens them, on the server, for one call. */

export type ConnectionStatus = 'ok' | 'needs_reconnect';

/* A connection as the app shows it (never the secret). */
/* assistant: the assistant may use it; permissions: per kind of action (lib/connectors/permissions.ts) */
export type Connection = { connector: string; label: string; status: ConnectionStatus; scopes: string[]; connectedAt: string; assistant: boolean; permissions: Record<string, Permission> };

type Row = { connector: string; label: string; status: ConnectionStatus; scopes: string[]; createdAt: Date; assistant: boolean; permissions: Record<string, Permission> | null };
const view = (r: Row): Connection => ({ connector: r.connector, label: r.label, status: r.status, scopes: r.scopes, connectedAt: iso(r.createdAt)!, assistant: r.assistant, permissions: r.permissions ?? {} });
const COLS = `connector, label, status, scopes, "createdAt", assistant, permissions`;

export async function listConnections(q: Queryable, userId: string): Promise<Connection[]> {
  const { rows } = await q.query<Row>(`select ${COLS} from connector_account where "userId" = $1 order by connector`, [userId]);
  return rows.map(view);
}

export async function getConnection(q: Queryable, userId: string, connector: string): Promise<Connection | null> {
  const { rows } = await q.query<Row>(`select ${COLS} from connector_account where "userId" = $1 and connector = $2`, [userId, connector]);
  return rows[0] ? view(rows[0]) : null;
}

/* Save a new connection, or replace the one there (connecting again). */
export async function saveConnection(q: Queryable, keys: ConnectorKeys, userId: string, connector: string, c: Credentials): Promise<Connection> {
  const { rows } = await q.query<Row>(
    `insert into connector_account ("userId", connector, "accountId", label, secret, scopes, "expiresAt", status)
     values ($1, $2, $3, $4, $5, $6, $7, 'ok')
     on conflict ("userId", connector) do update set "accountId" = excluded."accountId", label = excluded.label, secret = excluded.secret,
       scopes = excluded.scopes, "expiresAt" = excluded."expiresAt", status = 'ok', "createdAt" = now(), "updatedAt" = now()
     returning ${COLS}`,
    [userId, connector, c.account.id.slice(0, 200), c.account.label.slice(0, 200) || connector, seal(c, keys), c.scopes ?? [], c.expiresAt ? new Date(c.expiresAt) : null],
  );
  return view(rows[0]);
}

/* The credentials, for a call. `lock` takes the row for the rest of the
   transaction (so two refreshes never race). Null when not connected, or
   sealed with another key (CONNECTORS_SECRET changed). */
export async function secretFor(q: Queryable, keys: ConnectorKeys, userId: string, connector: string, opts: { lock?: boolean } = {}): Promise<{ credentials: Credentials | null; status: ConnectionStatus } | null> {
  const { rows } = await q.query<{ secret: string; status: ConnectionStatus }>(`select secret, status from connector_account where "userId" = $1 and connector = $2${opts.lock ? ' for update' : ''}`, [userId, connector]);
  if (!rows[0]) return null;
  return { credentials: unseal<Credentials>(rows[0].secret, keys), status: rows[0].status };
}

export async function updateCredentials(q: Queryable, keys: ConnectorKeys, userId: string, connector: string, c: Credentials): Promise<void> {
  await q.query(`update connector_account set secret = $3, scopes = $4, "expiresAt" = $5, status = 'ok', "updatedAt" = now() where "userId" = $1 and connector = $2`, [
    userId,
    connector,
    seal(c, keys),
    c.scopes ?? [],
    c.expiresAt ? new Date(c.expiresAt) : null,
  ]);
}

export async function markNeedsReconnect(q: Queryable, userId: string, connector: string): Promise<void> {
  await q.query(`update connector_account set status = 'needs_reconnect', "updatedAt" = now() where "userId" = $1 and connector = $2`, [userId, connector]);
}

/* Whether the assistant may use the app, and what it may do (merged into what was set). */
export async function saveSettings(q: Queryable, userId: string, connector: string, s: { assistant?: boolean; permissions?: Record<string, Permission> }): Promise<Connection | null> {
  const { rows } = await q.query<Row>(
    `update connector_account set assistant = coalesce($3, assistant), permissions = permissions || $4::jsonb, "updatedAt" = now()
     where "userId" = $1 and connector = $2 returning ${COLS}`,
    [userId, connector, s.assistant ?? null, JSON.stringify(s.permissions ?? {})],
  );
  return rows[0] ? view(rows[0]) : null;
}

export async function deleteConnection(q: Queryable, userId: string, connector: string): Promise<boolean> {
  await q.query(`delete from connector_sync where "userId" = $1 and connector = $2`, [userId, connector]);
  const { rowCount } = await q.query(`delete from connector_account where "userId" = $1 and connector = $2`, [userId, connector]);
  return (rowCount ?? 0) > 0;
}

/* ---------- sync positions ---------- */

export type SyncPosition = { version: number; projectId: string | null; syncedAt: string | null };

export async function getSync(q: Queryable, userId: string, connector: string, scope: string): Promise<SyncPosition | null> {
  const { rows } = await q.query<{ version: string; projectId: string | null; syncedAt: Date | null }>(`select version, "projectId", "syncedAt" from connector_sync where "userId" = $1 and connector = $2 and scope = $3`, [userId, connector, scope]);
  return rows[0] ? { version: Number(rows[0].version), projectId: rows[0].projectId, syncedAt: iso(rows[0].syncedAt) } : null;
}

export async function saveSync(q: Queryable, userId: string, connector: string, scope: string, p: { version: number; projectId: string | null }): Promise<void> {
  await q.query(
    `insert into connector_sync ("userId", connector, scope, version, "projectId", "syncedAt") values ($1, $2, $3, $4, $5, now())
     on conflict ("userId", connector, scope) do update set version = excluded.version, "projectId" = excluded."projectId", "syncedAt" = now()`,
    [userId, connector, scope, p.version, p.projectId],
  );
}
