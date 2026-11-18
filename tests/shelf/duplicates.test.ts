import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { savedResponse } from '@/lib/shelf/api/saved-response';
import { completeness, fillDetails, furtherStatus, joinNotes } from '@/lib/shelf/dedupe/merge-details';
import { countDuplicatePairs, duplicatePairs, findPairs, keepBoth, possibleDuplicatesOf } from '@/lib/shelf/dedupe/possible';
import { duplicateReason, normalizeTitle, titleSimilarity } from '@/lib/shelf/dedupe/similar';
import { mergeItems } from '@/lib/shelf/service/merge';
import { addItem, getItem, updateItem } from '@/lib/shelf/store/items';
import { addTags, addToProject } from '@/lib/shelf/store/links';
import { createPrivate, getPaper, putShared } from '@/lib/shelf/store/papers';
import { createProject } from '@/lib/shelf/store/projects';
import { findOrCreateTags } from '@/lib/shelf/store/tags';
import type { ShelfPaper } from '@/lib/shelf/types';
import { paper } from './fixtures';
import { openTestDb, TEST_DB_URL, type TestDb } from './testdb';

const STATE_OA = 'The state of OA: a large-scale analysis of the prevalence and impact of Open Access articles';

describe('similar titles', () => {
  it('normalizes case, accents, punctuation and markup', () => {
    expect(normalizeTitle('  Économie <i>de la</i> Santé: Une Étude! ')).toBe('economie de la sante une etude');
  });

  it('matches the same title written differently, not different papers', () => {
    expect(titleSimilarity(STATE_OA, 'The State of OA — a large scale analysis of the prevalence and impact of open-access articles')).toBeGreaterThanOrEqual(0.88);
    expect(titleSimilarity(STATE_OA, 'The state of OA: a large-scale analysis of the prevalance and impact of Open Acess articles')).toBeGreaterThanOrEqual(0.88);
    expect(titleSimilarity(STATE_OA, 'The state of open data: a large-scale analysis of data sharing in biology')).toBeLessThan(0.88);
    expect(titleSimilarity('Deep learning', 'Deep learning.')).toBe(1);
    expect(titleSimilarity('Deep learning', 'Deep learnings')).toBe(0); // short titles must match exactly
  });

  it('needs the same year for a title match', () => {
    const k = (over: object) => ({ title: STATE_OA, year: 2018, doi: null, openalexId: null, ...over });
    expect(duplicateReason(k({}), k({}))).toBe('similar_title');
    expect(duplicateReason(k({}), k({ year: 2017 }))).toBeNull();
    expect(duplicateReason(k({ doi: '10.1/x', year: 1 }), k({ doi: '10.1/x', year: 2 }))).toBe('same_doi');
  });

  it('finds pairs once and skips dismissed ones', () => {
    const rows = [
      { id: 'a', title: STATE_OA, year: 2018, doi: null, openalexId: null },
      { id: 'b', title: STATE_OA.toUpperCase(), year: 2018, doi: null, openalexId: null },
      { id: 'c', title: 'Something else entirely, about rivers', year: 2018, doi: null, openalexId: null },
      { id: 'd', title: 'Different title', year: 2001, doi: '10.5/q', openalexId: null },
      { id: 'e', title: 'Another different one', year: 2003, doi: '10.5/q', openalexId: null },
    ];
    expect(findPairs(rows)).toEqual([
      { a: 'd', b: 'e', reason: 'same_doi' },
      { a: 'a', b: 'b', reason: 'similar_title' },
    ]);
    expect(findPairs(rows, new Set(['a|b']))).toHaveLength(1);
  });
});

describe('what a merge keeps', () => {
  const sp = (over: Partial<ShelfPaper>): ShelfPaper => ({ ...paper('W1'), origin: 'openalex', ...over });
  it('prefers OpenAlex, then the more complete record', () => {
    expect(completeness(sp({ origin: 'openalex', abstract: null }))).toBeGreaterThan(completeness(sp({ origin: 'manual', openalexId: null })));
    expect(completeness(sp({ origin: 'manual', doi: '10.1/x' }))).toBeGreaterThan(completeness(sp({ origin: 'manual', doi: null })));
  });

  it('fills gaps from the other record', () => {
    const merged = fillDetails(sp({ origin: 'manual', doi: null, abstract: null, authors: [] }), sp({ origin: 'import', doi: '10.1234/x', abstract: 'Text', topics: ['t'] }));
    expect(merged).toMatchObject({ origin: 'manual', doi: '10.1234/x', abstract: 'Text', authors: [{ name: 'Ada Lovelace' }] });
  });

  it('keeps the further reading status and both notes', () => {
    expect(furtherStatus('to_read', 'done')).toBe('done');
    expect(furtherStatus('reading', 'to_read')).toBe('reading');
    expect(joinNotes('A', 'B')).toBe('A\n\n---\n\nB');
    expect(joinNotes('A', 'A')).toBe('A');
    expect(joinNotes(null, ' B ')).toBe('B');
  });
});

describe.skipIf(!TEST_DB_URL)('possible duplicates and merging (Postgres)', () => {
  let db: TestDb;
  let user: string;
  beforeAll(async () => {
    db = await openTestDb();
    user = await db.addUser();
  });
  afterAll(async () => db?.close());

  it('flags a similar paper on save and merges into the OpenAlex record, keeping everything', async () => {
    await putShared(db.pool, paper('W500', { title: STATE_OA, year: 2018, doi: '10.7717/peerj.4375' }));
    const own = await createPrivate(db.pool, user, { ...paper('X'), title: 'The State of OA - a large scale analysis of the prevalence and impact of open access articles', year: 2018, doi: null }, 'manual');
    const manual = (await addItem(db.pool, user, own.id, 'manual')).item;
    const p1 = await createProject(db.pool, user, 'Thesis');
    const [tag] = await findOrCreateTags(db.pool, user, ['important']);
    await addToProject(db.pool, user, [manual.id], p1.id);
    await addTags(db.pool, user, [manual.id], [tag.id]);
    await updateItem(db.pool, user, manual.id, { note: 'My notes', readingStatus: 'done' });

    const oa = (await addItem(db.pool, user, 'W500', 'search')).item;
    const r = await savedResponse(db.pool, user, oa);
    expect(r.possibleDuplicates).toEqual([{ id: manual.id, title: own.title, year: 2018 }]);
    expect(await countDuplicatePairs(db.pool, user)).toBe(1);

    const merged = await mergeItems(db.pool, user, manual.id, oa.id);
    expect(merged.removedId).toBe(manual.id);
    expect(merged.item).toMatchObject({ id: oa.id, readingStatus: 'done', note: 'My notes', projectIds: [p1.id], tagIds: [tag.id], paper: { id: 'W500' } });
    expect(await getItem(db.pool, user, manual.id)).toBeNull();
    expect(await getPaper(db.pool, own.id)).toBeNull(); // the unused private record goes
    expect(await duplicatePairs(db.pool, user)).toEqual([]);
  });

  it('combines two private records field by field', async () => {
    const a = await createPrivate(db.pool, user, { ...paper('A'), title: 'Rivers and floods in the twentieth century', year: 1999, doi: null, abstract: null }, 'manual');
    const b = await createPrivate(db.pool, user, { ...paper('B'), title: 'Rivers and Floods in the Twentieth Century.', year: 1999, doi: '10.4444/rivers', abstract: 'About rivers.' }, 'import');
    const ia = (await addItem(db.pool, user, a.id, 'manual')).item;
    const ib = (await addItem(db.pool, user, b.id, 'import')).item;
    expect((await possibleDuplicatesOf(db.pool, user, ia.id)).map((i) => i.id)).toEqual([ib.id]);
    const r = await mergeItems(db.pool, user, ia.id, ib.id);
    expect(r.item.paper).toMatchObject({ doi: '10.4444/rivers', abstract: 'About rivers.' });
  });

  it('keeps both when asked, and only for the user’s own items', async () => {
    const a = (await addItem(db.pool, user, (await createPrivate(db.pool, user, { ...paper('C'), title: 'Bridges of the old city and their keepers', year: 2005, doi: null }, 'manual')).id, 'manual')).item;
    const b = (await addItem(db.pool, user, (await createPrivate(db.pool, user, { ...paper('D'), title: 'Bridges of the old city and their keeper', year: 2005, doi: null }, 'manual')).id, 'manual')).item;
    const stranger = await db.addUser();
    expect(await keepBoth(db.pool, stranger, a.id, b.id)).toBe(false);
    expect(await countDuplicatePairs(db.pool, user)).toBe(1);
    expect(await keepBoth(db.pool, user, b.id, a.id)).toBe(true);
    expect(await countDuplicatePairs(db.pool, user)).toBe(0);
    await expect(mergeItems(db.pool, stranger, a.id, b.id)).rejects.toMatchObject({ code: 'not_found' });
    await expect(mergeItems(db.pool, user, a.id, a.id)).rejects.toMatchObject({ code: 'bad_request' });
  });
});
