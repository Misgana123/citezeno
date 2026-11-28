import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { connectedApps, openCapability, type ConnectorDeps } from '@/lib/connectors/access';
import { disconnect } from '@/lib/connectors/connect';
import { connectorKeys } from '@/lib/connectors/crypto';
import { getConnection, saveConnection, saveSettings } from '@/lib/connectors/store';
import type { Calendar, Connector, ConnectorDefinition } from '@/lib/providers/connectors/types';
import { openTestDb, TEST_DB_URL, type TestDb } from '../shelf/testdb';

const keys = connectorKeys({ CONNECTORS_SECRET: 'k'.repeat(40) })!;

/* Pretend apps: two calendars (one sharing a grant with "drive"), counting revokes. */
function apps() {
  const revoked: string[] = [];
  const make = (name: string, caps: ConnectorDefinition['capabilities'], grantGroup?: string) => {
    const connector: Connector = { name, auth: { signIn: null, apiKey: null }, open: () => ({ calendar: { calendars: async () => [{ id: name, name, primary: true, canWrite: true }] } as unknown as Calendar }), revoke: async () => void revoked.push(name) };
    const def: ConnectorDefinition = { name, label: name.toUpperCase(), description: '', services: [], capabilities: caps, grantGroup, create: () => connector };
    return { connector, def };
  };
  const list = [make('drive', ['files'], 'g'), make('gcal', ['calendar'], 'g'), make('ms', ['calendar', 'files'])];
  const registry = Object.fromEntries(list.map((a) => [a.def.name, a.def]));
  const build = (n: string) => list.find((a) => a.def.name === n)?.connector ?? null;
  return { revoked, registry, build };
}

describe.skipIf(!TEST_DB_URL)('several apps for one capability (postgres)', () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await openTestDb();
  });
  afterAll(async () => t?.close());

  it('lists every connected app per capability in registry order, and opens the one asked for', async () => {
    const user = await t.addUser();
    const a = apps();
    const d: ConnectorDeps = { db: t.pool, keys, build: a.build, registry: a.registry };
    for (const n of ['ms', 'gcal']) await saveConnection(t.pool, keys, user, n, { accessToken: n, account: { id: n, label: n } });
    expect(Object.fromEntries(await connectedApps(d, user))).toEqual({ calendar: ['gcal', 'ms'], files: ['ms'] });
    expect((await openCapability(d, user, 'calendar')).connector).toBe('gcal');
    expect((await openCapability(d, user, 'calendar', 'ms')).label).toBe('MS');
    await expect(openCapability(d, user, 'calendar', 'drive')).rejects.toMatchObject({ code: 'not_connected' });
    // switched off for the assistant: still there for the app, gone for the assistant
    await saveSettings(t.pool, user, 'gcal', { assistant: false });
    expect((await connectedApps(d, user, { assistant: true })).get('calendar')).toEqual(['ms']);
  });

  it('doesn’t withdraw a shared grant while another app still uses it', async () => {
    const user = await t.addUser();
    const a = apps();
    const d: ConnectorDeps = { db: t.pool, keys, build: a.build, registry: a.registry };
    for (const n of ['drive', 'gcal']) await saveConnection(t.pool, keys, user, n, { accessToken: n, account: { id: n, label: n } });
    await disconnect(d, user, 'gcal');
    expect(a.revoked).toEqual([]);
    expect(await getConnection(t.pool, user, 'gcal')).toBeNull();
    await disconnect(d, user, 'drive');
    expect(a.revoked).toEqual(['drive']);
  });
});
