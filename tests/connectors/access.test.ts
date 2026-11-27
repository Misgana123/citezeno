import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { connectedCapabilities, credentialsFor, openCapability, type ConnectorDeps } from '@/lib/connectors/access';
import { connectorCatalog } from '@/lib/connectors/catalog';
import { beginSignIn, connectWithKey, disconnect, finishSignIn } from '@/lib/connectors/connect';
import { connectorKeys } from '@/lib/connectors/crypto';
import { getConnection, saveConnection } from '@/lib/connectors/store';
import { ConnectorAuthError, type Connector, type ConnectorDefinition, type Credentials } from '@/lib/providers/connectors/types';
import { openTestDb, TEST_DB_URL, type TestDb } from '../shelf/testdb';

const keys = connectorKeys({ CONNECTORS_SECRET: 'k'.repeat(40) })!;

/* A pretend app: OAuth 2 with refresh, and a "references" capability. */
function fakeApp(over: { refresh?: (c: Credentials) => Promise<Credentials>; listCalls?: { n: number } } = {}) {
  const calls = { refresh: 0, revoke: 0 };
  const connector: Connector = {
    name: 'demo',
    auth: {
      signIn: {
        type: 'oauth2',
        authorizeUrl: ({ state, redirectUri, codeChallenge }) => `https://demo.test/auth?state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}&cc=${codeChallenge}`,
        exchange: async ({ code, codeVerifier }) => ({ accessToken: `at-${code}-${codeVerifier.length}`, refreshToken: 'rt', expiresAt: Date.now() + 3600_000, account: { id: 'acc1', label: 'me@demo' } }),
        refresh:
          over.refresh ??
          (async (c) => {
            calls.refresh++;
            await new Promise((r) => setTimeout(r, 30));
            return { ...c, accessToken: `fresh-${calls.refresh}`, expiresAt: Date.now() + 3600_000, refreshToken: null };
          }),
      },
      apiKey: { type: 'api-key', helpUrl: 'https://demo.test/keys', check: async (key) => (key === 'goodkey123' ? { accessToken: key, account: { id: 'k1', label: 'Key user' } } : Promise.reject(new ConnectorAuthError('demo'))) },
    },
    open: (c) => ({
      references: {
        libraries: async () => {
          if (c.accessToken === 'revoked') throw new ConnectorAuthError('demo');
          return [{ id: 'user', name: c.accessToken, kind: 'user' as const, canWrite: true }];
        },
      } as never,
    }),
    revoke: async () => {
      calls.revoke++;
    },
  };
  const def: ConnectorDefinition = { name: 'demo', label: 'Demo', description: 'A test app.', services: ['Library'], capabilities: ['references'], create: () => connector };
  return { def, connector, calls };
}

describe.skipIf(!TEST_DB_URL)('connected apps (postgres)', () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await openTestDb();
  });
  afterAll(async () => t?.close());

  const depsFor = (app: ReturnType<typeof fakeApp>, now?: () => number): ConnectorDeps => ({ db: t.pool, keys, build: (n) => (n === 'demo' ? app.connector : null), registry: { demo: app.def }, now });

  it('signs in with OAuth 2: state cookie, PKCE, tokens kept sealed', async () => {
    const user = await t.addUser();
    const app = fakeApp();
    const d = depsFor(app);
    const begun = await beginSignIn(d, user, 'demo', { origin: 'https://cz.test', back: '/app/shelf' });
    const url = new URL(begun.redirect);
    expect(url.searchParams.get('redirect_uri')).toBe('https://cz.test/api/connectors/demo/callback');
    expect(url.searchParams.get('cc')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const state = url.searchParams.get('state')!;

    // someone else's callback, or a wrong state, is refused
    const other = await t.addUser();
    await expect(finishSignIn(d, other, 'demo', { origin: 'https://cz.test', params: new URLSearchParams({ state, code: 'c' }), cookie: begun.cookie })).rejects.toMatchObject({ code: 'bad_request' });
    await expect(finishSignIn(d, user, 'demo', { origin: 'https://cz.test', params: new URLSearchParams({ state: 'nope', code: 'c' }), cookie: begun.cookie })).rejects.toMatchObject({ code: 'bad_request' });
    await expect(finishSignIn(d, user, 'demo', { origin: 'https://cz.test', params: new URLSearchParams({ error: 'access_denied', state }), cookie: begun.cookie })).rejects.toMatchObject({ code: 'denied' });

    const done = await finishSignIn(d, user, 'demo', { origin: 'https://cz.test', params: new URLSearchParams({ state, code: 'abc' }), cookie: begun.cookie });
    expect(done.back).toBe('/app/shelf');
    expect(done.connection).toMatchObject({ connector: 'demo', label: 'me@demo', status: 'ok' });
    const { rows } = await t.pool.query(`select secret from connector_account where "userId" = $1`, [user]);
    expect(rows[0].secret).not.toContain('at-abc');
    expect((await credentialsFor(d, user, 'demo')).accessToken).toBe('at-abc-64');

    const catalog = await connectorCatalog(d, user);
    expect(catalog).toEqual([expect.objectContaining({ name: 'demo', signIn: true, apiKey: { helpUrl: 'https://demo.test/keys' }, connection: expect.objectContaining({ label: 'me@demo' }) })]);
    expect(JSON.stringify(catalog)).not.toContain('at-abc');
  });

  it('connects with a key only when the app accepts it', async () => {
    const user = await t.addUser();
    const d = depsFor(fakeApp());
    await expect(connectWithKey(d, user, 'demo', 'badkey123')).rejects.toMatchObject({ code: 'denied' });
    expect(await getConnection(t.pool, user, 'demo')).toBeNull();
    expect(await connectWithKey(d, user, 'demo', ' goodkey123 ')).toMatchObject({ label: 'Key user' });
  });

  it('refreshes an expiring token once, even when asked twice at once', async () => {
    const user = await t.addUser();
    const app = fakeApp();
    const d = depsFor(app);
    await saveConnection(t.pool, keys, user, 'demo', { accessToken: 'old', refreshToken: 'rt', expiresAt: Date.now() + 10_000, account: { id: 'a', label: 'A' } });
    const [a, b] = await Promise.all([credentialsFor(d, user, 'demo'), credentialsFor(d, user, 'demo')]);
    expect(app.calls.refresh).toBe(1);
    expect(a.accessToken).toBe('fresh-1');
    expect(b.accessToken).toBe('fresh-1');
    // the vendor sent no new refresh token: the old one is kept
    expect(a.refreshToken).toBe('rt');
  });

  it('a refused refresh marks the connection "connect again"', async () => {
    const user = await t.addUser();
    const d = depsFor(fakeApp({ refresh: async () => Promise.reject(new ConnectorAuthError('demo')) }));
    await saveConnection(t.pool, keys, user, 'demo', { accessToken: 'old', refreshToken: 'rt', expiresAt: Date.now() - 1, account: { id: 'a', label: 'A' } });
    await expect(credentialsFor(d, user, 'demo')).rejects.toMatchObject({ code: 'needs_reconnect' });
    expect((await getConnection(t.pool, user, 'demo'))?.status).toBe('needs_reconnect');
    expect((await connectedCapabilities(d, user)).size).toBe(0);
  });

  it('opens a capability; a token refused mid-call marks the connection', async () => {
    const user = await t.addUser();
    const d = depsFor(fakeApp());
    await expect(openCapability(d, user, 'references')).rejects.toMatchObject({ code: 'not_connected' });
    await saveConnection(t.pool, keys, user, 'demo', { accessToken: 'live', account: { id: 'a', label: 'A' } });
    expect([...(await connectedCapabilities(d, user)).entries()]).toEqual([['references', 'demo']]);
    const { api, label } = await openCapability(d, user, 'references');
    expect(label).toBe('Demo');
    expect(await api.libraries()).toEqual([expect.objectContaining({ name: 'live' })]);

    await saveConnection(t.pool, keys, user, 'demo', { accessToken: 'revoked', account: { id: 'a', label: 'A' } });
    const again = await openCapability(d, user, 'references');
    await expect(again.api.libraries()).rejects.toMatchObject({ code: 'needs_reconnect' });
    expect((await getConnection(t.pool, user, 'demo'))?.status).toBe('needs_reconnect');
  });

  it('a different CONNECTORS_SECRET makes stored connections unreadable: connect again', async () => {
    const user = await t.addUser();
    const app = fakeApp();
    await saveConnection(t.pool, keys, user, 'demo', { accessToken: 'x', account: { id: 'a', label: 'A' } });
    const d = { ...depsFor(app), keys: connectorKeys({ CONNECTORS_SECRET: 'z'.repeat(40) })! };
    await expect(credentialsFor(d, user, 'demo')).rejects.toMatchObject({ code: 'needs_reconnect' });
  });

  it('disconnecting withdraws access and forgets the connection', async () => {
    const user = await t.addUser();
    const app = fakeApp();
    const d = depsFor(app);
    await saveConnection(t.pool, keys, user, 'demo', { accessToken: 'x', account: { id: 'a', label: 'A' } });
    expect(await disconnect(d, user, 'demo')).toBe(true);
    expect(app.calls.revoke).toBe(1);
    expect(await getConnection(t.pool, user, 'demo')).toBeNull();
  });

  it('without CONNECTORS_SECRET nothing can be connected', async () => {
    const user = await t.addUser();
    const d = { ...depsFor(fakeApp()), keys: null };
    expect(await connectorCatalog(d, user)).toEqual([]);
    await expect(beginSignIn(d, user, 'demo', { origin: 'https://cz.test', back: '/' })).rejects.toMatchObject({ code: 'not_set_up' });
  });
});
