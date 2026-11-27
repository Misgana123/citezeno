import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { basicPdfReader } from '@/lib/providers/basic-pdf';
import { memoryStore } from '@/lib/providers/storage/memory';
import { connectorKeys } from '@/lib/connectors/crypto';
import { cloudFileToShelf } from '@/lib/connectors/service/file-to-shelf';
import { saveConnection } from '@/lib/connectors/store';
import type { CloudFiles, Connector, ConnectorDefinition } from '@/lib/providers/connectors/types';
import { shelfConfig } from '@/lib/shelf/config';
import type { MatchDeps, PdfDeps } from '@/lib/shelf/service/pdf-upload';
import { getPdfRow } from '@/lib/shelf/store/pdfs';
import { sourcesOver } from '../papers/fake-openalex';
import { paperPdf } from '../shelf/pdf-fixtures';
import { openTestDb, TEST_DB_URL, type TestDb } from '../shelf/testdb';

const keys = connectorKeys({ CONNECTORS_SECRET: 'f'.repeat(40) })!;
const work = { id: 'https://openalex.org/W900', display_name: 'Paper W900', doi: 'https://doi.org/10.5555/rivers.2020', authorships: [] };

describe.skipIf(!TEST_DB_URL)('a PDF from cloud files onto the shelf (postgres)', () => {
  let t: TestDb;
  const store = memoryStore();
  const config = { ...shelfConfig({}), pdfMaxBytes: 50_000, storageBytesPerUser: 120_000, uploadsPerDay: 100 };
  const files: Record<string, { kind: 'pdf' | 'other'; name: string; bytes: Uint8Array }> = {
    f1: { kind: 'pdf', name: 'rivers.pdf', bytes: paperPdf() },
    f2: { kind: 'other', name: 'photo.png', bytes: new Uint8Array([1, 2]) },
    f3: { kind: 'pdf', name: 'fake.pdf', bytes: new TextEncoder().encode('<html>'.padEnd(200, ' ')) },
  };
  const cloud: CloudFiles = {
    list: async () => [],
    get: async (id) => ({ id, name: files[id].name, mime: files[id].kind === 'pdf' ? 'application/pdf' : 'image/png', kind: files[id].kind, sizeBytes: files[id].bytes.byteLength, modifiedAt: null, url: null }),
    download: async (id) => ({ name: files[id].name, mime: 'application/pdf', bytes: files[id].bytes }),
    upload: async () => Promise.reject(new Error('unused')),
  };
  const connector: Connector = { name: 'drive', auth: { signIn: null, apiKey: null }, open: () => ({ files: cloud }) };
  const def: ConnectorDefinition = { name: 'drive', label: 'Drive', description: '', services: [], capabilities: ['files'], create: () => connector };
  const get = vi.fn(async (path: string) => {
    if (path.startsWith('/works/')) return { body: work, costUsd: 0, status: 200 };
    throw Object.assign(new Error('nf'), { name: 'ProviderError', code: 'not_found' });
  });
  const pdf = (): PdfDeps & MatchDeps => ({ db: t.pool, store, config, allowUpload: async () => true, sources: () => sourcesOver(get as never), pdfText: basicPdfReader, reserveSearch: async () => {} });
  const deps = () => ({ db: t.pool, keys, build: () => connector, registry: { drive: def } });

  beforeAll(async () => {
    t = await openTestDb();
  });
  afterAll(async () => t?.close());

  it('needs the app connected', async () => {
    const user = await t.addUser();
    await expect(cloudFileToShelf(deps(), pdf(), user, { fileId: 'f1' })).rejects.toMatchObject({ code: 'not_connected' });
  });

  it('stores the file, reads it and suggests the paper, as an upload does', async () => {
    const user = await t.addUser();
    await saveConnection(t.pool, keys, user, 'drive', { accessToken: 'x', account: { id: 'a', label: 'A' } });
    const r = await cloudFileToShelf(deps(), pdf(), user, { fileId: 'f1' });
    expect(r.match).toMatchObject({ matching: 'doi', candidates: [{ id: 'openalex:W900' }] });
    const row = await getPdfRow(t.pool, user, r.pdf.id);
    expect(row).toMatchObject({ status: 'ready', fileName: 'rivers.pdf', pageCount: 2 });
  });

  it('refuses files that aren’t PDFs, and leaves nothing behind', async () => {
    const user = await t.addUser();
    await saveConnection(t.pool, keys, user, 'drive', { accessToken: 'x', account: { id: 'a', label: 'A' } });
    await expect(cloudFileToShelf(deps(), pdf(), user, { fileId: 'f2' })).rejects.toMatchObject({ code: 'invalid_file' });
    await expect(cloudFileToShelf(deps(), pdf(), user, { fileId: 'f3' })).rejects.toMatchObject({ code: 'invalid_file' });
    const { rows } = await t.pool.query(`select count(*)::int as n from shelf_pdf where "userId" = $1`, [user]);
    expect(rows[0].n).toBe(0);
  });
});
