import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { AgentContext } from '@/lib/agent/context';
import { offeredTools } from '@/lib/agent/tools';
import { CONNECTOR_TOOLS } from '@/lib/agent/tools/connectors';
import { runTool } from '@/lib/agent/tools/run';
import { connectedCapabilities, type ConnectorDeps } from '@/lib/connectors/access';
import { connectorCatalog } from '@/lib/connectors/catalog';
import { connectorKeys } from '@/lib/connectors/crypto';
import { cleanPermissions, PERMISSION_ROWS, permissionOf, permissionRows, type Permission } from '@/lib/connectors/permissions';
import { getConnection, saveConnection, saveSettings } from '@/lib/connectors/store';
import type { Capabilities, Capability, Connector, ConnectorDefinition, NotesPages } from '@/lib/providers/connectors/types';
import { openTestDb, TEST_DB_URL, type TestDb } from '../shelf/testdb';

describe('what the assistant may do with a connected app', () => {
  it('has a setting for every kind of action a connector tool takes', () => {
    for (const t of CONNECTOR_TOOLS) expect(PERMISSION_ROWS[t.needs!]?.[t.kind as 'read' | 'write'], `${t.name} (${t.needs}.${t.kind})`).toBeTruthy();
  });

  it('reads freely and asks before changes until the user says otherwise', () => {
    expect(permissionOf({}, 'pages', 'read')).toBe('allow');
    expect(permissionOf(undefined, 'pages', 'write')).toBe('ask');
    expect(permissionOf({ 'pages.write': 'never' }, 'pages', 'write')).toBe('never');
    expect(permissionOf({ 'pages.write': 'sometimes' }, 'pages', 'write')).toBe('ask');
    expect(cleanPermissions({ 'pages.write': 'allow', 'pages.fly': 'allow', 'nope.read': 'ask', 'files.read': 'maybe' })).toEqual({ 'pages.write': 'allow' });
    expect(permissionRows(['documents'], {}).map((r) => r.key)).toEqual(['documents.write']);
  });

  const PAGE = '0123456789abcdef0123456789abcdef';
  const pages = { search: async () => [], create: async () => ({ id: 'p', title: 'T', kind: 'page', url: null, editedAt: null }) } as unknown as NotesPages;
  const ctxWith = (perms: Record<string, Permission>) => {
    const connected = new Map<Capability, { name: string; label: string }>([['pages', { name: 'notion', label: 'Notion' }]]);
    return {
      userId: 'u1',
      connectors: { connected, permission: (cap: Capability, kind: 'read' | 'write') => permissionOf(perms, cap, kind), open: async (cap: Capability) => ({ api: ({ pages } as Partial<Capabilities>)[cap], connector: 'notion', label: 'Notion' }) },
    } as unknown as AgentContext;
  };

  it('"never" hides the tools and refuses them; "allow" skips the question; "ask" asks even for reading', async () => {
    const never = { 'pages.write': 'never' as const };
    const offered = offeredTools({ web: false, connected: new Set<Capability>(['pages']), permission: (c, k) => permissionOf(never, c, k) }).map((t) => t.name);
    expect(offered).toContain('notes_search');
    expect(offered).not.toContain('notes_create_page');
    expect((await runTool(ctxWith(never), 'notes_create_page', { parentId: PAGE, title: 'T', blocks: [{ type: 'paragraph', text: 'Hi' }] })).outcome).toMatchObject({ status: 'error', code: 'denied', message: expect.stringContaining('Notion') });

    expect((await runTool(ctxWith({}), 'notes_create_page', { parentId: PAGE, title: 'T', blocks: [{ type: 'paragraph', text: 'Hi' }] })).outcome).toMatchObject({ status: 'needs_confirmation' });
    expect((await runTool(ctxWith({ 'pages.write': 'allow' }), 'notes_create_page', { parentId: PAGE, title: 'T', blocks: [{ type: 'paragraph', text: 'Hi' }] })).outcome).toMatchObject({ status: 'done' });

    expect((await runTool(ctxWith({}), 'notes_search', {})).outcome).toMatchObject({ status: 'done' });
    expect((await runTool(ctxWith({ 'pages.read': 'ask' }), 'notes_search', {})).outcome).toMatchObject({ status: 'needs_confirmation', question: expect.stringContaining('Notion') });
    expect((await runTool(ctxWith({ 'pages.read': 'ask' }), 'notes_search', {}, { confirmed: true })).outcome).toMatchObject({ status: 'done' });
  });
});

describe.skipIf(!TEST_DB_URL)('connection settings (postgres)', () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await openTestDb();
  });
  afterAll(async () => t?.close());

  const keys = connectorKeys({ CONNECTORS_SECRET: 'k'.repeat(40) })!;
  const connector: Connector = { name: 'demo', auth: { signIn: null, apiKey: null }, open: () => ({}) };
  const def: ConnectorDefinition = { name: 'demo', label: 'Demo', description: 'A test app.', services: [], capabilities: ['pages'], create: () => connector };
  const deps = (): ConnectorDeps => ({ db: t.pool, keys, build: (n) => (n === 'demo' ? connector : null), registry: { demo: def } });

  it('switches an app off for the assistant and keeps what it may do, across reconnecting', async () => {
    const user = await t.addUser();
    expect(await saveSettings(t.pool, user, 'demo', { assistant: false })).toBeNull();
    await saveConnection(t.pool, keys, user, 'demo', { accessToken: 'x', account: { id: 'a', label: 'A' } });
    expect(await getConnection(t.pool, user, 'demo')).toMatchObject({ assistant: true, permissions: {} });

    await saveSettings(t.pool, user, 'demo', { assistant: false, permissions: { 'pages.write': 'never' } });
    await saveSettings(t.pool, user, 'demo', { permissions: { 'pages.read': 'ask' } });
    expect(await getConnection(t.pool, user, 'demo')).toMatchObject({ assistant: false, permissions: { 'pages.write': 'never', 'pages.read': 'ask' } });

    expect((await connectedCapabilities(deps(), user)).size).toBe(1);
    expect((await connectedCapabilities(deps(), user, { assistant: true })).size).toBe(0);
    const [view] = await connectorCatalog(deps(), user);
    expect(view.permissions).toEqual([expect.objectContaining({ key: 'pages.read', value: 'ask' }), expect.objectContaining({ key: 'pages.write', value: 'never' })]);

    // connecting again keeps the settings
    await saveConnection(t.pool, keys, user, 'demo', { accessToken: 'y', account: { id: 'a', label: 'A' } });
    expect(await getConnection(t.pool, user, 'demo')).toMatchObject({ assistant: false, permissions: { 'pages.write': 'never' } });
  });
});
