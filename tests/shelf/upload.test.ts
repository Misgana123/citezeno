import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { basicPdfReader } from '@/lib/providers/basic-pdf';
import { sourcesOver } from '../papers/fake-openalex';
import { shelfConfig } from '@/lib/shelf/config';
import { mergeItems } from '@/lib/shelf/service/merge';
import { beginUpload, completeUpload, confirmUpload, type PdfDeps, type MatchDeps } from '@/lib/shelf/service/pdf-upload';
import { emptyTrash } from '@/lib/shelf/service/trash';
import { saveManualPaper } from '@/lib/shelf/service/save-manual';
import { memoryStore } from '@/lib/providers/storage/memory';
import { addItem, deleteItems, getItem, listItems } from '@/lib/shelf/store/items';
import { deleteAbandoned, getPdfRow } from '@/lib/shelf/store/pdfs';
import { putShared } from '@/lib/shelf/store/papers';
import { paper } from './fixtures';
import { paperPdf, scannedPdf } from './pdf-fixtures';
import { openTestDb, TEST_DB_URL, type TestDb } from './testdb';

const work = (id: string, doi: string) => ({ id: `https://openalex.org/${id}`, display_name: `Paper ${id}`, doi: `https://doi.org/${doi}`, authorships: [] });

describe.skipIf(!TEST_DB_URL)('PDF uploads (Postgres + memory storage)', () => {
  let db: TestDb;
  let user: string;
  const store = memoryStore();
  const config = { ...shelfConfig({}), pdfMaxBytes: 50_000, storageBytesPerUser: 120_000, uploadsPerDay: 100 };
  const get = vi.fn(async (path: string) => {
    if (path === '/works/doi:10.5555/rivers.2020') return { body: work('W900', '10.5555/rivers.2020'), costUsd: 0, status: 200 };
    if (path === '/works/W900') return { body: work('W900', '10.5555/rivers.2020'), costUsd: 0, status: 200 };
    if (path === '/works') return { body: { results: [work('W901', '10.1/x')] }, costUsd: 0.001, status: 200 };
    throw Object.assign(new Error('nf'), { name: 'ProviderError', code: 'not_found' });
  });
  const reserveSearch = vi.fn(async () => {});
  let uploadsLeft = 100;
  const deps = (): PdfDeps & MatchDeps => ({
    db: db.pool,
    store,
    config,
    allowUpload: async () => uploadsLeft-- > 0,
    sources: () => sourcesOver(get as never),
    pdfText: basicPdfReader,
    reserveSearch,
  });

  beforeAll(async () => {
    db = await openTestDb();
    user = await db.addUser();
  });
  afterAll(async () => db?.close());

  /* begin, "upload" the bytes as the browser would, complete */
  async function upload(bytes: Uint8Array, opts: { itemId?: string; userId?: string } = {}) {
    const b = await beginUpload(deps(), opts.userId ?? user, { fileName: 'paper.pdf', sizeBytes: bytes.byteLength, itemId: opts.itemId });
    store.put(b.upload.fields.public_id, bytes);
    return completeUpload(deps(), opts.userId ?? user, b.pdf.id);
  }

  it('refuses when storage is not set up, a file is too big, storage is full or today’s uploads are used', async () => {
    await expect(beginUpload({ ...deps(), store: null }, user, { fileName: 'a.pdf', sizeBytes: 10 })).rejects.toMatchObject({ code: 'unavailable' });
    await expect(beginUpload(deps(), user, { fileName: 'a.pdf', sizeBytes: 60_000 })).rejects.toMatchObject({ code: 'too_large', message: expect.stringContaining('limit') });
    const big = await beginUpload(deps(), user, { fileName: 'a.pdf', sizeBytes: 45_000 });
    const big2 = await beginUpload(deps(), user, { fileName: 'b.pdf', sizeBytes: 45_000 });
    await expect(beginUpload(deps(), user, { fileName: 'c.pdf', sizeBytes: 45_000 })).rejects.toMatchObject({ code: 'storage_full' });
    await db.pool.query(`delete from shelf_pdf where id = any($1)`, [[big.pdf.id, big2.pdf.id]]);
    uploadsLeft = 0;
    await expect(beginUpload(deps(), user, { fileName: 'a.pdf', sizeBytes: 10 })).rejects.toMatchObject({ code: 'user_limit' });
    uploadsLeft = 100;
  });

  it('rejects a file that is not a real PDF, and an upload that never arrived', async () => {
    const fake = new TextEncoder().encode('<html>'.padEnd(200, ' '));
    await expect(upload(fake)).rejects.toMatchObject({ code: 'invalid_file', message: 'This file isn’t a valid PDF.' });
    const b = await beginUpload(deps(), user, { fileName: 'a.pdf', sizeBytes: 100 });
    await expect(completeUpload(deps(), user, b.pdf.id)).rejects.toMatchObject({ code: 'bad_request' });
    expect(await getPdfRow(db.pool, user, b.pdf.id)).toBeNull();
  });

  it('reads the DOI and suggests the paper with a free lookup', async () => {
    const r = await upload(paperPdf());
    expect(r.match).toMatchObject({ matching: 'doi', found: { doi: '10.5555/rivers.2020', title: 'Rivers and floods in a changing climate' }, candidates: [{ id: 'openalex:W900' }] });
    expect(reserveSearch).not.toHaveBeenCalled();
    const item = await confirmUpload({ db: db.pool, sources: deps().sources }, user, r.pdf.id, { paperId: 'openalex:W900' });
    expect(item).toMatchObject({ addedVia: 'upload', paper: { id: 'openalex:W900' }, pdfs: [{ id: r.pdf.id, pageCount: 2 }] });
  });

  it('a second copy of a saved paper attaches to it', async () => {
    const r = await upload(paperPdf());
    expect(r.match?.saved).toMatchObject({ 'openalex:W900': expect.any(String) });
    const item = await confirmUpload({ db: db.pool, sources: deps().sources }, user, r.pdf.id, { paperId: 'openalex:W900' });
    expect(item.pdfs).toHaveLength(2);
  });

  it('falls back to a title search when there is no DOI, and to manual details', async () => {
    const r = await upload(paperPdf({ doi: '10.9999/unknown.1' }));
    expect(reserveSearch).toHaveBeenCalledTimes(1);
    expect(r.match).toMatchObject({ matching: 'title', candidates: [{ id: 'openalex:W901' }] });
    const item = await confirmUpload({ db: db.pool, sources: deps().sources }, user, r.pdf.id, { details: { title: 'Typed title', authors: [], year: 2020, source: null, url: null, doi: null, type: null, abstract: null } });
    expect(item).toMatchObject({ addedVia: 'upload', paper: { origin: 'manual', title: 'Typed title' } });
  });

  it('keeps a scanned PDF and says its text is not available', async () => {
    const r = await upload(scannedPdf());
    expect(r.pdf.textStatus).toBe('none');
    expect(r.match).toMatchObject({ matching: 'none', candidates: [] });
  });

  it('attaches straight to a paper when uploaded from it, and only to the user’s own', async () => {
    const own = await saveManualPaper(db.pool, user, { title: 'Attach target', authors: [], year: null, source: null, url: null, doi: null, type: null, abstract: null });
    const r = await upload(paperPdf(), { itemId: own.id });
    expect(r.item?.pdfs).toHaveLength(1);
    const stranger = await db.addUser();
    await expect(beginUpload(deps(), stranger, { fileName: 'x.pdf', sizeBytes: 10, itemId: own.id })).rejects.toMatchObject({ code: 'not_found' });
    const theirs = await upload(paperPdf(), { userId: stranger });
    await expect(confirmUpload({ db: db.pool, sources: deps().sources }, stranger, theirs.pdf.id, { itemId: own.id })).rejects.toMatchObject({ code: 'not_found' });
    await expect(completeUpload(deps(), stranger, r.pdf.id)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('filters by "has PDF"', async () => {
    const withPdf = await listItems(db.pool, user, { sort: 'added_desc', page: 1, perPage: 50, hasPdf: true });
    const without = await listItems(db.pool, user, { sort: 'added_desc', page: 1, perPage: 50, hasPdf: false });
    expect(withPdf.items.every((i) => i.pdfs.length > 0)).toBe(true);
    expect(without.items.every((i) => i.pdfs.length === 0)).toBe(true);
  });

  it('merging keeps both papers’ PDFs', async () => {
    await putShared(db.pool, paper('openalex:W950', { title: 'Merge with PDFs please', year: 2001 }));
    const a = (await addItem(db.pool, user, 'openalex:W950', 'search')).item;
    const b = await saveManualPaper(db.pool, user, { title: 'Merge with PDFs please', authors: [], year: 2001, source: null, url: null, doi: null, type: null, abstract: null });
    await upload(paperPdf(), { itemId: a.id });
    await upload(paperPdf(), { itemId: b.id });
    const merged = await mergeItems(db.pool, user, a.id, b.id);
    expect(merged.item.pdfs).toHaveLength(2);
  });

  it('deleting a paper, a PDF or an account empties storage through the trash', async () => {
    const own = await saveManualPaper(db.pool, user, { title: 'Doomed', authors: [], year: null, source: null, url: null, doi: null, type: null, abstract: null });
    const r = await upload(paperPdf(), { itemId: own.id });
    const key = `shelf/${user}/${r.pdf.id}.pdf`;
    expect(store.has(key)).toBe(true);
    await deleteItems(db.pool, user, [own.id]);
    expect(await getItem(db.pool, user, own.id)).toBeNull();
    await emptyTrash(db.pool, store);
    expect(store.has(key)).toBe(false);

    const leaver = await db.addUser();
    const theirs = await upload(paperPdf(), { userId: leaver });
    await db.pool.query(`delete from "user" where id = $1`, [leaver]);
    await emptyTrash(db.pool, store);
    expect(store.has(`shelf/${leaver}/${theirs.pdf.id}.pdf`)).toBe(false);
    const { rows } = await db.pool.query(`select count(*)::int as n from shelf_storage_trash`);
    expect(rows[0].n).toBe(0);
  });

  it('cleans up abandoned uploads', async () => {
    const b = await beginUpload(deps(), user, { fileName: 'never.pdf', sizeBytes: 10 });
    await db.pool.query(`update shelf_pdf set "uploadedAt" = now() - interval '2 days' where id = $1`, [b.pdf.id]);
    expect(await deleteAbandoned(db.pool)).toBeGreaterThanOrEqual(1);
    expect(await getPdfRow(db.pool, user, b.pdf.id)).toBeNull();
  });
});
