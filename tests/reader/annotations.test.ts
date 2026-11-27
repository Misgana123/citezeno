import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProviderError } from '@/lib/providers/errors';
import { pagesReader } from '@/lib/providers/pdf-text/pages';
import { memoryStore } from '@/lib/providers/storage/memory';
import { newAnnotationBody } from '@/lib/reader/bodies';
import type { ReaderDeps } from '@/lib/reader/deps';
import { annotations, changeHighlight, changePageNote, createHighlight, createPageNote, dropAnnotation, exportAnnotations, exportFor } from '@/lib/reader/service/annotations';
import { getItemByPaper, listItems } from '@/lib/shelf/store/items';
import { sourcesOver } from '../papers/fake-openalex';
import { openTestDb, TEST_DB_URL, type TestDb } from '../shelf/testdb';

const rect = (y: number) => [{ x: 0.1, y, w: 0.5, h: 0.02 }];
const hl = (page: number, quote: string, y = 0.3, note: string | null = null) => ({ page, quote, prefix: '', suffix: '', rects: rect(y), color: 'yellow' as const, note, pdfKey: 'open_access' });

describe('annotation bodies', () => {
  it('accepts highlights and page notes, and rejects bad positions', () => {
    expect(newAnnotationBody.parse({ kind: 'highlight', page: 2, quote: ' the sample ', rects: rect(0.2) })).toMatchObject({ quote: 'the sample', color: 'yellow', note: null, prefix: '' });
    expect(newAnnotationBody.safeParse({ kind: 'highlight', page: 2, quote: 'x', rects: [{ x: 2, y: 0, w: 0, h: 0 }] }).success).toBe(false);
    expect(newAnnotationBody.safeParse({ kind: 'highlight', page: 2, quote: 'x', rects: rect(0.1), color: 'red' }).success).toBe(false);
    expect(newAnnotationBody.safeParse({ kind: 'note', page: 1, x: 0.5, y: 0.5, text: '  ' }).success).toBe(false);
  });

  it('exports in page order with page numbers, as Markdown or plain text', () => {
    const paper = { id: 'openalex:W1', title: 'Night shifts', authors: [{ name: 'A. Writer', orcid: null }], year: 2020, doi: '10.1/x' } as never;
    const now = '2026-01-01T00:00:00.000Z';
    const hs = [
      { ...hl(3, 'Burnout fell.', 0.5, 'Key result'), id: 'h2', paperId: 'p', createdAt: now, updatedAt: now },
      { ...hl(1, 'We surveyed 1,200 nurses.'), id: 'h1', paperId: 'p', createdAt: now, updatedAt: now },
    ];
    const ns = [{ id: 'n1', paperId: 'p', page: 3, x: 0.1, y: 0.1, text: 'Compare with Smith', createdAt: now, updatedAt: now }];
    const md = exportAnnotations(paper, hs, ns, 'md');
    expect(md).toContain('# Highlights and notes: Night shifts');
    expect(md.indexOf('## Page 1')).toBeLessThan(md.indexOf('## Page 3'));
    expect(md.indexOf('Compare with Smith')).toBeLessThan(md.indexOf('Burnout fell.'));
    expect(md).toContain('> Burnout fell.\n\n**Note:** Key result');
    const txt = exportAnnotations(paper, hs, ns, 'txt');
    expect(txt).toContain('[p. 1] "We surveyed 1,200 nurses."');
    expect(txt).toContain('    Note: Key result');
    expect(exportAnnotations(paper, [], [], 'txt')).toContain('No highlights or notes yet.');
  });
});

describe.skipIf(!TEST_DB_URL)('highlights and notes (Postgres)', { timeout: 30_000 }, () => {
  let db: TestDb;
  let user: string;
  let other: string;
  let deps: ReaderDeps;
  const works: Record<string, unknown> = {
    W1: { id: 'https://openalex.org/W1', display_name: 'Night shifts and burnout', publication_year: 2020, cited_by_count: 1, authorships: [] },
  };

  beforeAll(async () => {
    db = await openTestDb();
    user = await db.addUser();
    other = await db.addUser();
    const sources = sourcesOver(async (path) => {
      const id = path.split('/').pop()!;
      if (!works[id]) throw new ProviderError('not_found', 'No such work.', { status: 404 });
      return { body: works[id], costUsd: 0, status: 200 };
    });
    deps = { db: db.pool, store: memoryStore(), web: () => ({}) as never, pages: () => pagesReader({}, (t) => t), embedder: () => null, sources: () => sources, maxPdfBytes: 1e6 };
  });
  afterAll(async () => db?.close());

  it('saves the paper to the shelf on the first highlight only', async () => {
    expect(await getItemByPaper(db.pool, user, 'openalex:W1')).toBeNull();
    const first = await createHighlight(deps, user, 'openalex:W1', hl(2, 'We surveyed 1,200 nurses.'));
    expect(first.autoSaved).toEqual({ itemId: expect.any(String) });
    expect((await getItemByPaper(db.pool, user, 'openalex:W1'))?.id).toBe(first.autoSaved!.itemId);
    const second = await createPageNote(deps, user, 'openalex:W1', { page: 1, x: 0.2, y: 0.8, text: 'Compare with the Smith cohort' });
    expect(second.autoSaved).toBeNull();
  });

  it('keeps them private, editable and removable', async () => {
    const { highlights, notes } = await annotations(deps, user, 'openalex:W1');
    expect(highlights).toHaveLength(1);
    expect(notes).toHaveLength(1);
    expect(await annotations(deps, other, 'openalex:W1')).toEqual({ highlights: [], notes: [] });
    await expect(changeHighlight(deps, other, highlights[0].id, { color: 'green' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(dropAnnotation(deps, other, 'highlight', highlights[0].id)).rejects.toMatchObject({ code: 'not_found' });
    expect(await changeHighlight(deps, user, highlights[0].id, { color: 'green', note: 'Large sample' })).toMatchObject({ color: 'green', note: 'Large sample' });
    expect(await changePageNote(deps, user, notes[0].id, { text: 'Compare with Jones' })).toMatchObject({ text: 'Compare with Jones' });
  });

  it('appear in shelf search', async () => {
    const byNote = await listItems(db.pool, user, { q: 'large sample', sort: 'relevance', page: 1, perPage: 10 });
    expect(byNote.items.map((i) => i.paper.id)).toEqual(['openalex:W1']);
    const byPageNote = await listItems(db.pool, user, { q: 'jones', sort: 'relevance', page: 1, perPage: 10 });
    expect(byPageNote.items).toHaveLength(1);
    expect((await listItems(db.pool, other, { q: 'large sample', sort: 'relevance', page: 1, perPage: 10 })).items).toEqual([]);
  });

  it('exports with page numbers, and removes', async () => {
    const md = await exportFor(deps, user, 'openalex:W1', 'md');
    expect(md.fileName).toBe('Night shifts and burnout - notes.md');
    expect(md.text).toContain('## Page 1');
    expect(md.text).toContain('**Note:** Large sample');
    const { highlights, notes } = await annotations(deps, user, 'openalex:W1');
    await dropAnnotation(deps, user, 'highlight', highlights[0].id);
    await dropAnnotation(deps, user, 'note', notes[0].id);
    expect(await annotations(deps, user, 'openalex:W1')).toEqual({ highlights: [], notes: [] });
  });
});
