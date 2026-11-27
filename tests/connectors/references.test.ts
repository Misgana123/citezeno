import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { capabilityOpener } from '@/lib/connectors/access';
import { connectorKeys } from '@/lib/connectors/crypto';
import { importReferences } from '@/lib/connectors/service/import-references';
import { sendShelf, toNotesRow } from '@/lib/connectors/service/send-shelf';
import { shelfRows } from '@/lib/connectors/service/shelf-rows';
import { saveConnection } from '@/lib/connectors/store';
import type { CloudSheets, Connector, ConnectorDefinition, NotesPages, RefItem, ReferenceLibrary } from '@/lib/providers/connectors/types';
import { parseListRequest } from '@/lib/shelf/api/list-request';
import { shelfConfig } from '@/lib/shelf/config';
import { addItem } from '@/lib/shelf/store/items';
import { putShared } from '@/lib/shelf/store/papers';
import { createTag } from '@/lib/shelf/store/tags';
import { paper } from '../shelf/fixtures';
import { openTestDb, TEST_DB_URL, type TestDb } from '../shelf/testdb';

const keys = connectorKeys({ CONNECTORS_SECRET: 'r'.repeat(40) })!;

const ref = (key: string, version: number, over: Partial<RefItem> = {}): RefItem => ({ key, version, type: 'article', title: `Title ${key}`, authors: ['Ada Lovelace'], year: 2021, source: 'J', doi: null, url: null, abstract: null, tags: [], collections: [], ...over });

describe.skipIf(!TEST_DB_URL)('reference manager import and sending papers (postgres)', () => {
  let t: TestDb;
  const config = shelfConfig({});
  let library: RefItem[] = [];
  let libraryVersion = 0;
  const itemsCalls: { since?: number; collectionKey?: string | null }[] = [];
  const added: { libraryId: string; items: unknown[]; collectionKey?: string | null }[] = [];
  const refs: ReferenceLibrary = {
    libraries: async () => [{ id: 'user', name: 'My Library', kind: 'user', canWrite: true }],
    collections: async () => [{ key: 'COL00001', name: 'Thesis', parentKey: null, items: 3 }],
    items: async (_lib, o) => {
      itemsCalls.push({ since: o.since, collectionKey: o.collectionKey });
      const pick = library.filter((i) => !o.since || i.version > o.since);
      return { items: pick.slice(o.start, o.start + o.limit), total: pick.length, version: libraryVersion };
    },
    search: async () => [],
    createCollection: async (_l, name) => ({ key: 'NEWCOL01', name, parentKey: null, items: 0 }),
    addItems: async (libraryId, items, o) => {
      added.push({ libraryId, items, collectionKey: o.collectionKey });
      return { added: items.length, failed: 0 };
    },
  };
  const created: unknown[] = [];
  const sheets: CloudSheets = {
    read: async () => Promise.reject(new Error('unused')),
    append: async () => Promise.reject(new Error('unused')),
    create: async (f) => {
      created.push(f);
      return { id: 's1', name: f.title, mime: 'x', kind: 'spreadsheet', sizeBytes: null, modifiedAt: null, url: 'https://sheets/s1' };
    },
  };
  const rowsAdded: unknown[] = [];
  const pages = {
    columns: async () => ({ title: 'Reading list', columns: [] }),
    addRows: async (_id: string, rows: unknown[]) => {
      rowsAdded.push(...rows);
      return { added: rows.length, url: 'https://notion/db' };
    },
  } as unknown as NotesPages;
  const apps: Record<string, { def: ConnectorDefinition; connector: Connector }> = {};
  for (const [name, cap, api] of [
    ['zot', 'references', { references: refs }],
    ['goog', 'sheets', { sheets }],
    ['note', 'pages', { pages }],
  ] as const) {
    const connector: Connector = { name, auth: { signIn: null, apiKey: null }, open: () => api };
    apps[name] = { connector, def: { name, label: name.toUpperCase(), description: '', services: [], capabilities: [cap], create: () => connector } };
  }
  const deps = () => ({ db: t.pool, keys, build: (n: string) => apps[n]?.connector ?? null, registry: Object.fromEntries(Object.entries(apps).map(([k, v]) => [k, v.def])) });

  beforeAll(async () => {
    t = await openTestDb();
  });
  afterAll(async () => t?.close());

  async function connectedUser() {
    const user = await t.addUser();
    for (const n of Object.keys(apps)) await saveConnection(t.pool, keys, user, n, { accessToken: 'x', account: { id: 'a', label: `${n} account` } });
    return user;
  }

  it('imports a collection into a new project, then syncs only what changed, into the same project', async () => {
    const user = await connectedUser();
    library = [ref('A', 5, { doi: '10.1/a' }), ref('B', 6), ref('C', 7, { title: null })];
    libraryVersion = 7;
    const first = await importReferences(capabilityOpener(deps(), user), { db: t.pool, config }, user, { libraryId: 'user', collectionKey: 'COL00001', name: 'Thesis', newProject: 'Thesis' });
    expect(first).toMatchObject({ found: 3, app: 'ZOT', since: null });
    const { rows: imp } = await t.pool.query(`select format, total, "projectId", "fileName" from shelf_import where id = $1`, [first.importId]);
    expect(imp[0]).toMatchObject({ format: 'zotero', total: 3, fileName: 'ZOT: Thesis' });
    expect(imp[0].projectId).toBeTruthy();
    const { rows: entries } = await t.pool.query(`select label, status, reason from shelf_import_entry where "importId" = $1 order by idx`, [first.importId]);
    expect(entries.map((e) => e.status)).toEqual(['pending', 'pending', 'failed']);

    // nothing changed: nothing queued, but the sync is remembered
    const none = await importReferences(capabilityOpener(deps(), user), { db: t.pool, config }, user, { libraryId: 'user', collectionKey: 'COL00001', name: 'Thesis', sync: true });
    expect(none).toMatchObject({ importId: null, found: 0, since: 7 });
    expect(itemsCalls.at(-1)).toEqual({ since: 7, collectionKey: 'COL00001' });

    library.push(ref('D', 9));
    libraryVersion = 9;
    const next = await importReferences(capabilityOpener(deps(), user), { db: t.pool, config }, user, { libraryId: 'user', collectionKey: 'COL00001', name: 'Thesis', sync: true });
    expect(next).toMatchObject({ found: 1, since: 7 });
    const { rows: imp2 } = await t.pool.query(`select "projectId", total from shelf_import where id = $1`, [next.importId]);
    expect(imp2[0]).toEqual({ projectId: imp[0].projectId, total: 1 });
  });

  it('refuses more than one import may bring in', async () => {
    const user = await connectedUser();
    library = Array.from({ length: 30 }, (_, i) => ref(`K${i}`, i + 1));
    await expect(importReferences(capabilityOpener(deps(), user), { db: t.pool, config: { ...config, importMaxEntries: 20 } }, user, { libraryId: 'user', name: 'All' })).rejects.toMatchObject({ code: 'too_large' });
  });

  it('sends shelf papers to a reference manager, a spreadsheet and a notes database', async () => {
    const user = await connectedUser();
    for (const id of ['W1', 'W2']) {
      await putShared(t.pool, paper(id));
      await addItem(t.pool, user, `openalex:${id}`, 'search');
    }
    await createTag(t.pool, user, 'sleep', null);
    const { rows, total } = await shelfRows(t.pool, user, (page, perPage) => parseListRequest(new URLSearchParams({ page: String(page), perPage: String(perPage) })), 1000);
    expect(total).toBe(2);

    const z = await sendShelf(capabilityOpener(deps(), user), rows, { to: 'references', libraryId: 'user', newCollection: 'From Citezeno' });
    expect(z).toEqual({ app: 'ZOT', sent: 2, failed: 0, url: null, where: 'From Citezeno' });
    expect(added.at(-1)).toMatchObject({ libraryId: 'user', collectionKey: 'NEWCOL01' });
    expect((added.at(-1)!.items as { doi: string; title: string }[]).map((i) => i.doi).sort()).toEqual(['10.1000/w1', '10.1000/w2']);

    const s = await sendShelf(capabilityOpener(deps(), user), rows, { to: 'sheets', title: 'My papers' });
    expect(s).toMatchObject({ app: 'GOOG', sent: 2, url: 'https://sheets/s1', where: 'My papers' });
    const sheet = (created.at(-1) as { sheets: { rows: unknown[][] }[] }).sheets[0];
    expect(sheet.rows[0][0]).toBe('Title');
    expect(sheet.rows).toHaveLength(3);

    const n = await sendShelf(capabilityOpener(deps(), user), rows, { to: 'pages', databaseId: 'db1' });
    expect(n).toMatchObject({ app: 'NOTE', sent: 2, where: 'Reading list', url: 'https://notion/db' });
    expect(rowsAdded.at(-1)).toMatchObject({ Title: expect.stringMatching(/^Paper W/), Authors: ['Ada Lovelace'], DOI: expect.stringMatching(/^10\.1000/) });
    expect(toNotesRow(rows[0]).Tags).toEqual([]);

    await expect(sendShelf(capabilityOpener(deps(), user), [], { to: 'sheets', title: 'x' })).rejects.toMatchObject({ code: 'bad_request' });
  });

  it('nothing is sent to an app that isn’t connected', async () => {
    const user = await t.addUser();
    await expect(sendShelf(capabilityOpener(deps(), user), [{ item: {} as never, projects: [], folders: [], tags: [] }], { to: 'sheets', title: 'x' })).rejects.toMatchObject({ code: 'not_connected' });
  });
});
