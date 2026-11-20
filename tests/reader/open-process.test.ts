import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Embedder } from '@/lib/providers/embeddings/embedder';
import { ProviderError } from '@/lib/providers/errors';
import { pagesReader } from '@/lib/providers/pdf-text/pages';
import { memoryStore } from '@/lib/providers/storage/memory';
import type { WebFiles } from '@/lib/providers/web-files/types';
import type { ReaderDeps } from '@/lib/reader/deps';
import { runReaderJobs } from '@/lib/reader/jobs/runner';
import { isReusableLicense } from '@/lib/reader/license';
import { openPaper } from '@/lib/reader/service/open';
import { processNext } from '@/lib/reader/service/process';
import { readableText } from '@/lib/reader/service/text';
import { checkFileLink, signFileLink } from '@/lib/reader/sign';
import { listPassages } from '@/lib/reader/store/passages';
import { getSharedText, queueReembedding, retryText } from '@/lib/reader/store/texts';
import { enableVectors } from '@/lib/reader/vector';
import { addItem } from '@/lib/shelf/store/items';
import { putShared } from '@/lib/shelf/store/papers';
import { createPending, markReady } from '@/lib/shelf/store/pdfs';
import { textPdf } from '../fixtures/text-pdf';
import { sourcesOver } from '../papers/fake-openalex';
import { paper } from '../shelf/fixtures';
import { scannedPdf } from '../shelf/pdf-fixtures';
import { openTestDb, TEST_DB_URL, type TestDb } from '../shelf/testdb';

process.env.BETTER_AUTH_SECRET ||= 'test-secret-for-signed-links-0123456789';

describe('licenses and signed links', () => {
  it('stores shared copies only for reusable licenses', () => {
    for (const l of ['cc-by', 'CC-BY-4.0', 'cc-by-sa', 'cc0', 'public-domain']) expect(isReusableLicense(l), l).toBe(true);
    for (const l of ['cc-by-nc', 'cc-by-nd', 'cc-by-nc-sa', 'other-oa', 'publisher-specific-oa', '', null, undefined]) expect(isReusableLicense(l), String(l)).toBe(false);
  });

  it('signs file links for one user, one paper, for a while', () => {
    const { exp, sig } = signFileLink('u1', 'openalex:W1', 60, 1_000_000, 'k');
    expect(checkFileLink('u1', 'openalex:W1', exp, sig, 1_000_000, 'k')).toBe(true);
    expect(checkFileLink('u2', 'openalex:W1', exp, sig, 1_000_000, 'k')).toBe(false);
    expect(checkFileLink('u1', 'openalex:W2', exp, sig, 1_000_000, 'k')).toBe(false);
    expect(checkFileLink('u1', 'openalex:W1', exp, sig, 1_000_000 + 61_000, 'k')).toBe(false);
    expect(checkFileLink('u1', 'openalex:W1', exp, 'nope', 1_000_000, 'k')).toBe(false);
  });
});

/* A paper long enough to have several passages. */
const body = (topic: string) => Array.from({ length: 30 }, (_, i) => `The ${topic} finding number ${i} concerns nurses on night shifts.`).join(' ');
function lines(text: string, start: number) {
  const words = text.split(' ');
  return Array.from({ length: Math.ceil(words.length / 12) }, (_, i) => ({ text: words.slice(i * 12, i * 12 + 12).join(' '), y: start - i * 13 }));
}
const PAPER_PDF = textPdf([[{ text: 'Methods', y: 720, size: 13 }, ...lines(body('method'), 700)], [{ text: 'Results', y: 720, size: 13 }, ...lines(body('result'), 700)]]);

const work = (id: string, over: Record<string, unknown> = {}) => ({
  id: `https://openalex.org/${id}`,
  display_name: `Paper ${id}`,
  publication_year: 2021,
  cited_by_count: 3,
  authorships: [],
  open_access: { is_oa: true },
  best_oa_location: { pdf_url: `https://pub.example/${id}.pdf`, license: 'cc-by' },
  ...over,
});

const DIMS = 4;
const fakeEmbedder = (id = 'fake-embed'): Embedder => ({
  model: { id, provider: 'fake', vendorModel: id, usdPerM: 0.1, maxInputTokens: 2000, maxBatch: 3 },
  dimensions: DIMS,
  embed: vi.fn(async (_kind, inputs) => ({ vectors: inputs.map((_: unknown, i: number) => [1, i, 0, 0]), tokens: inputs.length * 10, costUsd: 0.0001 })),
});

describe.skipIf(!TEST_DB_URL)('opening and processing papers (Postgres)', { timeout: 30_000 }, () => {
  let db: TestDb;
  let user: string;
  let other: string;
  const works: Record<string, unknown> = {};
  const files: Record<string, Uint8Array | Error> = {};
  const store = memoryStore();
  let embedder: Embedder | null = fakeEmbedder();
  const web: WebFiles = {
    name: 'fake-web',
    fetchPdf: vi.fn(async (url: string) => {
      const f = files[url];
      if (!f) throw new ProviderError('not_found', 'gone', { reason: 'not_found' });
      if (f instanceof Error) throw f;
      return { stream: new Blob([f as BlobPart]).stream(), size: f.byteLength, finalUrl: url };
    }),
  };
  let deps: ReaderDeps;

  beforeAll(async () => {
    db = await openTestDb();
    user = await db.addUser();
    other = await db.addUser();
    await enableVectors(db.pool, DIMS);
    const sources = sourcesOver(async (path) => {
      const id = path.split('/').pop()!;
      if (!works[id]) throw new ProviderError('not_found', 'No such work.', { status: 404 });
      return { body: works[id], costUsd: 0, status: 200 };
    });
    deps = { db: db.pool, store, web: () => web, pages: () => pagesReader({}, (t) => t), embedder: () => embedder, sources: () => sources, maxPdfBytes: 5_000_000 };
  });
  afterAll(async () => db?.close());

  const later = () => Date.now() + 50_000;

  it('opens an open-access paper through a signed link, processes it once and stores a shared copy (CC BY)', async () => {
    works.W1 = work('W1');
    files['https://pub.example/W1.pdf'] = PAPER_PDF;
    const first = await openPaper(deps, user, 'openalex%3AW1');
    expect(first.view.paper).toMatchObject({ id: 'openalex:W1', title: 'Paper W1', license: 'cc-by' });
    expect(first.view.pdf).toMatchObject({ kind: 'open_access', stored: false, url: expect.stringMatching(/^\/api\/reader\/openalex%3AW1\/file\?exp=\d+&sig=/) });
    expect(first.view.text).toMatchObject({ status: 'pending', search: null });
    expect(first.view.shelf).toBeNull();
    expect(first.needsWork).toBe(first.view.text!.id);

    expect(await processNext(deps, { id: first.needsWork!, deadline: later() })).toBe('embedded');
    const text = (await getSharedText(db.pool, 'openalex:W1'))!;
    expect(text).toMatchObject({ status: 'ready', stage: 'done', embeddingModel: 'fake-embed', embeddingDims: DIMS, storageKey: expect.stringMatching(/^reader\/shared\//) });
    expect(store.has(text.storageKey!)).toBe(true);
    const passages = await listPassages(db.pool, text.id);
    expect(passages.length).toBeGreaterThanOrEqual(2);
    expect(passages.map((p) => p.section)).toEqual(expect.arrayContaining(['Methods', 'Results']));
    const logged = await db.pool.query(`select action, "costUsd" from reader_ai_log where "paperId" = 'openalex:W1'`);
    expect(logged.rows.length).toBeGreaterThan(0);
    expect(logged.rows[0].action).toBe('embed');

    // the next open (any user) reuses it: served from storage, search by meaning on
    const again = await openPaper(deps, other, 'openalex:W1');
    expect(again.view.pdf).toMatchObject({ kind: 'open_access', stored: true, url: expect.stringContaining('memory://download/') });
    expect(again.view.text).toMatchObject({ status: 'ready', search: 'meaning' });
    expect(again.needsWork).toBeNull();
    expect(web.fetchPdf).toHaveBeenCalledTimes(1);
  });

  it('never stores PDFs with other licenses, but keeps their text', async () => {
    works.W2 = work('W2', { best_oa_location: { pdf_url: 'https://pub.example/W2.pdf', license: 'cc-by-nc' } });
    files['https://pub.example/W2.pdf'] = PAPER_PDF;
    const { needsWork } = await openPaper(deps, user, 'openalex:W2');
    await processNext(deps, { id: needsWork!, deadline: later() });
    const t = (await getSharedText(db.pool, 'openalex:W2'))!;
    expect(t).toMatchObject({ status: 'ready', storageKey: null });
    const again = await openPaper(deps, user, 'openalex:W2');
    expect(again.view.pdf).toMatchObject({ kind: 'open_access', stored: false });
  });

  it('says why when the free PDF can’t be fetched, and can try again', async () => {
    works.W3 = work('W3');
    files['https://pub.example/W3.pdf'] = new ProviderError('bad_request', 'login page', { reason: 'not_pdf' });
    const { needsWork } = await openPaper(deps, user, 'openalex:W3');
    expect(await processNext(deps, { id: needsWork!, deadline: later() })).toBe('failed');
    expect(await getSharedText(db.pool, 'openalex:W3')).toMatchObject({ status: 'failed', error: 'download:not_pdf' });
    expect((await openPaper(deps, user, 'openalex:W3')).view.pdf).toEqual({ kind: 'none', reason: 'download_failed' });
    files['https://pub.example/W3.pdf'] = PAPER_PDF;
    await retryText(db.pool, (await getSharedText(db.pool, 'openalex:W3'))!.id);
    expect(await processNext(deps, { deadline: later() })).toBe('embedded');
  });

  it('a temporary outage is retried rather than failed', async () => {
    works.W4 = work('W4');
    files['https://pub.example/W4.pdf'] = new ProviderError('unavailable', 'down');
    const { needsWork } = await openPaper(deps, user, 'openalex:W4');
    expect(await processNext(deps, { id: needsWork!, deadline: later() })).toBe('failed');
    expect(await getSharedText(db.pool, 'openalex:W4')).toMatchObject({ status: 'processing', error: 'fetch:unavailable', attempts: 1 });
  });

  it('marks a scan as having no text', async () => {
    works.W5 = work('W5');
    files['https://pub.example/W5.pdf'] = scannedPdf();
    const { needsWork } = await openPaper(deps, user, 'openalex:W5');
    expect(await processNext(deps, { id: needsWork!, deadline: later() })).toBe('no_text');
    expect((await openPaper(deps, user, 'openalex:W5')).view.text).toMatchObject({ status: 'no_text', search: null });
  });

  it('shows a paper with no PDF as details only', async () => {
    works.W6 = work('W6', { best_oa_location: null, open_access: { is_oa: false } });
    const r = await openPaper(deps, user, 'openalex:W6');
    expect(r.view.pdf).toEqual({ kind: 'none', reason: 'no_pdf' });
    expect(r.view.text).toBeNull();
    await expect(openPaper(deps, user, 'openalex:W404')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('prefers the user’s own upload, privately, and starts reading', async () => {
    works.W7 = work('W7');
    files['https://pub.example/W7.pdf'] = PAPER_PDF;
    const shared = await putShared(db.pool, paper('openalex:W7', { pdfUrl: 'https://pub.example/W7.pdf' }));
    const { item } = await addItem(db.pool, user, shared.id, 'search');
    const pdf = await createPending(db.pool, user, { fileName: 'mine.pdf', sizeBytes: PAPER_PDF.byteLength, itemId: item.id });
    await markReady(db.pool, user, pdf.id, { sizeBytes: PAPER_PDF.byteLength, pageCount: 2, textStatus: 'done', text: null, found: { doi: null, title: null } });
    store.put(pdf.storageKey, PAPER_PDF);

    const r = await openPaper(deps, user, 'openalex:W7');
    expect(r.view.pdf).toMatchObject({ kind: 'upload', fileName: 'mine.pdf', stored: true });
    expect(r.view.shelf).toEqual({ itemId: item.id, readingStatus: 'reading' });
    expect(await processNext(deps, { id: r.needsWork!, deadline: later() })).toBe('embedded');
    expect((await readableText(deps, user, 'openalex:W7')).text).toMatchObject({ scope: 'user', ownerId: user, status: 'ready' });

    // a second, newer upload opens by default; the first one when it is asked for
    const second = await createPending(db.pool, user, { fileName: 'newer.pdf', sizeBytes: PAPER_PDF.byteLength, itemId: item.id });
    await markReady(db.pool, user, second.id, { sizeBytes: PAPER_PDF.byteLength, pageCount: 2, textStatus: 'done', text: null, found: { doi: null, title: null } });
    store.put(second.storageKey, PAPER_PDF);
    expect((await openPaper(deps, user, 'openalex:W7')).view.pdf).toMatchObject({ kind: 'upload', fileName: 'newer.pdf' });
    expect((await openPaper(deps, user, 'openalex:W7', { pdfId: pdf.id })).view.pdf).toMatchObject({ kind: 'upload', fileName: 'mine.pdf' });
    expect((await readableText(deps, user, 'openalex:W7', { pdfId: pdf.id })).text).toMatchObject({ pdfId: pdf.id });
    // someone else's file ID is ignored (their own copy, or the open-access PDF, opens instead)
    expect((await openPaper(deps, other, 'openalex:W7', { pdfId: pdf.id })).view.pdf).toMatchObject({ kind: 'open_access' });
    await db.pool.query(`delete from shelf_pdf where id = $1`, [second.id]);

    // another user gets the open-access text, never this upload
    const theirs = await openPaper(deps, other, 'openalex:W7');
    expect(theirs.view.pdf).toMatchObject({ kind: 'open_access' });
    expect((await readableText(deps, other, 'openalex:W7')).text?.scope).toBe('shared');

    // deleting the upload deletes its text and passages
    const uploadText = (await readableText(deps, user, 'openalex:W7')).text!;
    await db.pool.query(`delete from shelf_pdf where id = $1`, [pdf.id]);
    expect((await db.pool.query(`select count(*)::int n from reader_passage where "textId" = $1`, [uploadText.id])).rows[0].n).toBe(0);
  });

  it('remembers where the user stopped and when they opened it', async () => {
    const r = await db.pool.query(`select "paperId", title from reader_position where "userId" = $1 order by "updatedAt" desc limit 1`, [user]);
    expect(r.rows[0]).toMatchObject({ paperId: 'openalex:W7', title: 'Paper W7' });
  });

  it('re-embeds when the embedding model changes, using keywords meanwhile', async () => {
    embedder = fakeEmbedder('new-embed');
    expect(await queueReembedding(db.pool, 'new-embed', DIMS)).toBeGreaterThan(0);
    expect((await openPaper(deps, user, 'openalex:W1')).view.text).toMatchObject({ status: 'ready', search: 'keywords' });
    const report = await runReaderJobs(deps, 40_000, { sharedKeepDays: 90 });
    expect(report.processed).toBeGreaterThan(0);
    expect(await getSharedText(db.pool, 'openalex:W1')).toMatchObject({ stage: 'done', embeddingModel: 'new-embed' });
    expect((await openPaper(deps, user, 'openalex:W1')).view.text).toMatchObject({ search: 'meaning' });
  });

  it('without embeddings set up, text is still ready (keyword search)', async () => {
    embedder = null;
    works.W8 = work('W8');
    files['https://pub.example/W8.pdf'] = PAPER_PDF;
    const { needsWork } = await openPaper(deps, user, 'openalex:W8');
    expect(await processNext(deps, { id: needsWork!, deadline: later() })).toBe('extracted');
    expect((await openPaper(deps, user, 'openalex:W8')).view.text).toMatchObject({ status: 'ready', search: 'keywords' });
    embedder = fakeEmbedder('new-embed');
  });

  it('removes stored shared copies nobody opened for a long time', async () => {
    const t = (await getSharedText(db.pool, 'openalex:W1'))!;
    await db.pool.query(`update reader_text set "lastOpenedAt" = now() - interval '100 days' where id = $1`, [t.id]);
    const report = await runReaderJobs(deps, 20_000, { sharedKeepDays: 90 });
    expect(report.copiesRemoved).toBe(1);
    expect(store.has(t.storageKey!)).toBe(false);
    expect(await getSharedText(db.pool, 'openalex:W1')).toMatchObject({ storageKey: null, status: 'ready' });
  });
});
