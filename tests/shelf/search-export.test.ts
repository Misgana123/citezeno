import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bibValue, citeKey, toBibtex } from '@/lib/shelf/export/bibtex';
import { csvCell, toCsv } from '@/lib/shelf/export/csv';
import { notesMarkdown, pdfFileNames } from '@/lib/shelf/export/notes';
import { toRis } from '@/lib/shelf/export/ris';
import type { ExportRow } from '@/lib/shelf/export/types';
import { addItem, listItems, updateItem } from '@/lib/shelf/store/items';
import { addTags } from '@/lib/shelf/store/links';
import { toPrefixQuery, type ListQuery } from '@/lib/shelf/store/list-query';
import { createPending, markReady } from '@/lib/shelf/store/pdfs';
import { createPrivate, putShared } from '@/lib/shelf/store/papers';
import { findOrCreateTags } from '@/lib/shelf/store/tags';
import type { ShelfItem } from '@/lib/shelf/types';
import { toRows } from '@/components/shelf/export/run-export';
import { paper } from './fixtures';
import { openTestDb, TEST_DB_URL, type TestDb } from './testdb';

describe('search words', () => {
  it('become a safe prefix query', () => {
    expect(toPrefixQuery('Flood risk')).toBe('flood:* & risk:*');
    expect(toPrefixQuery("x' | !y & (z):*")).toBe('x:* & y:* & z:*');
    expect(toPrefixQuery('Österreich 2020')).toBe('österreich:* & 2020:*');
    expect(toPrefixQuery('  ;;  ')).toBeNull();
  });
});

const row = (over: Partial<ShelfItem['paper']> = {}, item: Partial<ShelfItem> = {}, extra: Partial<ExportRow> = {}): ExportRow => ({
  item: {
    id: 'i1',
    paper: { ...paper('W1'), origin: 'openalex', ...over },
    addedAt: '2026-01-02T03:04:05.000Z',
    addedVia: 'search',
    readingStatus: 'reading',
    note: null,
    projectIds: [],
    folderIds: [],
    tagIds: [],
    pdfs: [],
    ...item,
  },
  projects: [],
  folders: [],
  tags: [],
  ...extra,
});

describe('export writers', () => {
  it('BibTeX: escapes, balances braces, and makes unique keys', () => {
    expect(bibValue('R&D 50% of $x_1 {unbalanced')).toBe('R\\&D 50\\% of \\$x\\_1 {unbalanced}');
    expect(bibValue('}}oops{')).toBe('oops{}');
    const a = row({ title: 'Analytical Engines and Their Uses', year: 1843, authors: [{ name: 'Ada Lovelace', orcid: null }] }, { note: 'Great' }, { tags: ['history'] });
    expect(citeKey(a)).toBe('lovelace1843analytical');
    const bib = toBibtex([a, a]);
    expect(bib).toContain('@article{lovelace1843analytical,');
    expect(bib).toContain('@article{lovelace1843analyticala,');
    expect(bib).toContain('  title = {{Analytical Engines and Their Uses}}');
    expect(bib).toContain('  keywords = {history}');
    expect(bib).toContain('  annote = {Great}');
    expect(bib).toContain('  doi = {10.1000/w1}');
  });

  it('RIS: one tag per line, every author, ER at the end', () => {
    const ris = toRis([row({ authors: [{ name: 'A One', orcid: null }, { name: 'B Two', orcid: null }] }, { note: 'line one\nline two' }, { tags: ['x'] })]);
    expect(ris.split('\r\n')).toEqual(expect.arrayContaining(['TY  - JOUR', 'AU  - A One', 'AU  - B Two', 'KW  - x', 'N1  - line one line two', 'ER  - ']));
  });

  it('CSV: quotes, keeps formulas as text, and starts with a BOM', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell(true)).toBe('yes');
    const csv = toCsv([row({ title: 'T, with comma' }, { note: '+1 great' }, { projects: ['Thesis'], tags: ['a', 'b'] })]);
    expect(csv.startsWith('﻿Title,Authors,Year')).toBe(true);
    expect(csv).toContain('"T, with comma"');
    expect(csv).toContain("'+1 great");
    expect(csv).toContain('Thesis');
    expect(csv).toContain('a; b');
  });

  it('notes and PDF names for the ZIP', () => {
    const r = row({ title: 'A/B: tests?', year: 2020, authors: [{ name: 'Ada Lovelace', orcid: null }] }, { note: 'My note', pdfs: [{ id: 'f1', fileName: 'x.pdf', sizeBytes: 1, pageCount: 1, textStatus: 'done' }, { id: 'f2', fileName: 'y.pdf', sizeBytes: 1, pageCount: 1, textStatus: 'done' }] });
    expect(notesMarkdown([r, row()])).toContain('## A/B: tests?');
    expect(notesMarkdown([r, row()])).toContain('1 paper with notes');
    expect([...pdfFileNames([r]).values()]).toEqual(['Lovelace 2020 - A B tests (1).pdf', 'Lovelace 2020 - A B tests (2).pdf']);
  });

  it('resolves group names for export rows', () => {
    const r = toRows([row({}, { projectIds: ['p1', 'gone'], tagIds: ['t1'] }).item], { projects: [{ id: 'p1', name: 'Thesis', createdAt: '', count: 1 }], folders: [], tags: [{ id: 't1', name: 'key', color: null, count: 1 }] });
    expect(r[0]).toMatchObject({ projects: ['Thesis'], tags: ['key'] });
  });
});

describe.skipIf(!TEST_DB_URL)('searching the shelf (Postgres)', () => {
  let db: TestDb;
  let user: string;
  const ids: Record<string, string> = {};
  const Q = (over: Partial<ListQuery>): ListQuery => ({ sort: 'relevance', page: 1, perPage: 25, ...over });
  const found = async (over: Partial<ListQuery>) => (await listItems(db.pool, user, Q(over))).items.map((i) => i.paper.title);

  beforeAll(async () => {
    db = await openTestDb();
    user = await db.addUser();
    await putShared(db.pool, paper('W1', { title: 'Floods in river deltas', authors: [{ name: 'Grace Hopper', orcid: null }], abstract: 'Sediment and water.', doi: '10.4242/deltas' }));
    await putShared(db.pool, paper('W2', { title: 'Coral reefs', abstract: 'Warm oceans and flooding coasts.' }));
    await putShared(db.pool, paper('W3', { title: 'Machine translation' }));
    for (const id of ['W1', 'W2', 'W3']) ids[id] = (await addItem(db.pool, user, id, 'search')).item.id;
    const own = await createPrivate(db.pool, user, { ...paper('X'), title: 'Grandmother notes', doi: null, abstract: null, authors: [] }, 'manual');
    ids.X = (await addItem(db.pool, user, own.id, 'manual')).item.id;
    await updateItem(db.pool, user, ids.W3, { note: 'Useful for the methodology chapter' });
    const [tag] = await findOrCreateTags(db.pool, user, ['hydrology']);
    await addTags(db.pool, user, [ids.X], [tag.id]);
    const pdf = await createPending(db.pool, user, { fileName: 'a.pdf', sizeBytes: 10, itemId: ids.W2 });
    await markReady(db.pool, user, pdf.id, { sizeBytes: 10, pageCount: 1, textStatus: 'done', text: 'Bleaching events were recorded near Zanzibar every summer.', found: { doi: null, title: null } });
  });
  afterAll(async () => db?.close());

  it('finds by title, author, abstract and DOI, matching word starts', async () => {
    expect(await found({ q: 'deltas' })).toEqual(['Floods in river deltas']);
    expect(await found({ q: 'hopp' })).toEqual(['Floods in river deltas']);
    expect(await found({ q: 'sediment water' })).toEqual(['Floods in river deltas']);
    expect(await found({ q: '10.4242/deltas' })).toEqual(['Floods in river deltas']);
  });

  it('finds by note, tag and PDF text', async () => {
    expect(await found({ q: 'methodology' })).toEqual(['Machine translation']);
    expect(await found({ q: 'hydrology' })).toEqual(['Grandmother notes']);
    expect(await found({ q: 'zanzibar' })).toEqual(['Coral reefs']);
  });

  it('ranks title matches first', async () => {
    expect(await found({ q: 'flood' })).toEqual(['Floods in river deltas', 'Coral reefs']);
  });

  it('combines search with filters and selections, never across users', async () => {
    expect(await found({ q: 'flood', hasPdf: true })).toEqual(['Coral reefs']);
    expect(await found({ ids: [ids.W3, ids.X], sort: 'title' })).toEqual(['Grandmother notes', 'Machine translation']);
    const other = await db.addUser();
    expect((await listItems(db.pool, other, Q({ q: 'zanzibar' }))).total).toBe(0);
    expect((await listItems(db.pool, other, Q({ ids: [ids.W1] }))).total).toBe(0);
  });
});
