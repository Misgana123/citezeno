import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ProviderError } from '@/lib/providers/errors';
import type { QueryParams } from '@/lib/providers/openalex/client';
import { sourcesOver } from '../papers/fake-openalex';
import { manualDetails, manualPaperSchema } from '@/lib/shelf/api/manual-schema';
import { parseInput } from '@/lib/shelf/lookup/parse-input';
import { needsSearch, resolveInput } from '@/lib/shelf/lookup/resolve';
import { editDetails } from '@/lib/shelf/service/edit-details';
import { saveManualPaper } from '@/lib/shelf/service/save-manual';
import { saveFoundPaper } from '@/lib/shelf/service/save-found';
import { draftToInput, emptyDraft } from '@/components/shelf/add/manual-draft';
import { openTestDb, TEST_DB_URL, type TestDb } from './testdb';

describe('reading what the user pasted', () => {
  it.each([
    ['10.7717/peerj.4375', { kind: 'doi', doi: '10.7717/peerj.4375', fromLink: false }],
    ['doi:10.7717/PeerJ.4375.', { kind: 'doi', doi: '10.7717/peerj.4375', fromLink: false }],
    ['https://doi.org/10.7717/peerj.4375', { kind: 'doi', doi: '10.7717/peerj.4375', fromLink: true }],
    ['dx.doi.org/10.1038/nature12373', { kind: 'doi', doi: '10.1038/nature12373', fromLink: true }],
    // a provider's own IDs and links are recognised later, by the enabled paper sources
    ['https://openalex.org/W2741809807', { kind: 'id', raw: 'https://openalex.org/W2741809807', fromLink: true }],
    ['https://api.openalex.org/works/w2741809807', { kind: 'id', raw: 'https://api.openalex.org/works/w2741809807', fromLink: true }],
    ['W2741809807', { kind: 'id', raw: 'W2741809807', fromLink: false }],
    ['CRISPR', { kind: 'id', raw: 'CRISPR', fromLink: false }],
    ['https://arxiv.org/abs/1706.03762v7', { kind: 'doi', doi: '10.48550/arxiv.1706.03762', fromLink: true }],
    ['https://arxiv.org/pdf/1706.03762.pdf', { kind: 'doi', doi: '10.48550/arxiv.1706.03762', fromLink: true }],
    ['arXiv:hep-th/9901001', { kind: 'doi', doi: '10.48550/arxiv.hep-th/9901001', fromLink: false }],
    ['1706.03762', { kind: 'doi', doi: '10.48550/arxiv.1706.03762', fromLink: false }],
    ['https://pubmed.ncbi.nlm.nih.gov/29456894/', { kind: 'pmid', id: '29456894' }],
    ['https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5815332/', { kind: 'pmcid', id: 'PMC5815332' }],
    ['PMID: 29456894', { kind: 'pmid', id: '29456894' }],
    ['https://link.springer.com/article/10.1007/s11192-019-03094-2', { kind: 'doi', doi: '10.1007/s11192-019-03094-2', fromLink: true }],
    ['https://onlinelibrary.wiley.com/doi/full/10.1002/asi.24445?af=R', { kind: 'doi', doi: '10.1002/asi.24445', fromLink: true }],
    ['https://example.com/blog/my-post', { kind: 'id', raw: 'https://example.com/blog/my-post', fromLink: true }],
    ['Piwowar, H. (2018). The state of OA. PeerJ, 6, e4375. https://doi.org/10.7717/peerj.4375', { kind: 'doi', doi: '10.7717/peerj.4375', fromLink: false }],
    ['The state of OA: a large-scale analysis', { kind: 'title', title: 'The state of OA: a large-scale analysis' }],
    ['   ', { kind: 'empty' }],
  ])('%s', (input, expected) => {
    expect(parseInput(input)).toEqual(expected);
  });
});

const work = (id: string) => ({ id: `https://openalex.org/${id}`, display_name: `Paper ${id}`, doi: `https://doi.org/10.1000/${id.toLowerCase()}`, authorships: [] });

function fakeClient(impl: (path: string, params: QueryParams) => unknown) {
  const get = vi.fn(async (path: string, params: QueryParams = {}) => {
    const body = impl(path, params);
    if (body instanceof Error) throw body;
    return { body, costUsd: 0, status: 200 };
  });
  return { client: sourcesOver(get as never), get };
}

describe('looking papers up', () => {
  it('uses free single lookups for IDs', async () => {
    const { client, get } = fakeClient(() => work('W1'));
    expect(await resolveInput(client, parseInput('10.7717/peerj.4375'))).toMatchObject({ via: 'doi', papers: [{ id: 'openalex:W1' }] });
    expect(get.mock.calls[0][0]).toBe('/works/doi:10.7717/peerj.4375');
    await resolveInput(client, parseInput('https://pubmed.ncbi.nlm.nih.gov/29456894/'));
    expect(get.mock.calls[1][0]).toBe('/works/pmid:29456894');
    expect((await resolveInput(client, parseInput('https://doi.org/10.1234/abcd.1'))).via).toBe('link');
  });

  it('hands provider IDs and links to the source that recognises them, and searches single words nobody does', async () => {
    const { client, get } = fakeClient((path) => (path === '/works' ? { results: [work('W5')] } : work('W2741809807')));
    expect(await resolveInput(client, parseInput('https://openalex.org/W2741809807'))).toMatchObject({ via: 'link', papers: [{ id: 'openalex:W2741809807' }] });
    expect(get.mock.calls[0][0]).toBe('/works/W2741809807');
    expect(await resolveInput(client, parseInput('w2741809807'))).toMatchObject({ via: 'doi' });
    expect(needsSearch(client, parseInput('W2741809807'))).toBe(false);
    expect(needsSearch(client, parseInput('CRISPR'))).toBe(true);
    expect(await resolveInput(client, parseInput('CRISPR'))).toMatchObject({ via: 'title', papers: [{ id: 'openalex:W5' }] });
    expect(get.mock.calls[2][1]).toMatchObject({ search: 'CRISPR' });
  });

  it('searches titles and offers up to five matches', async () => {
    const { client, get } = fakeClient(() => ({ results: [work('W1'), work('W2'), { id: 'junk' }] }));
    const r = await resolveInput(client, parseInput('Attention is all you need'));
    expect(r).toMatchObject({ via: 'title' });
    expect(r.papers.map((p) => p.id)).toEqual(['openalex:W1', 'openalex:W2']);
    expect(get.mock.calls[0][1]).toMatchObject({ search: 'Attention is all you need', per_page: 5 });
  });

  it('explains a missing DOI and an unreadable link', async () => {
    const { client } = fakeClient(() => new ProviderError('not_found', 'nope'));
    await expect(resolveInput(client, parseInput('10.9999/missing'))).rejects.toMatchObject({ code: 'not_found', message: expect.stringContaining('couldn’t find this DOI') });
    await expect(resolveInput(client, parseInput('https://example.com/x'))).rejects.toMatchObject({ code: 'bad_request', message: expect.stringContaining('couldn’t read a paper from this link') });
  });

  it('passes OpenAlex outages through', async () => {
    const { client } = fakeClient(() => new ProviderError('unavailable', 'down'));
    await expect(resolveInput(client, parseInput('10.1234/x'))).rejects.toMatchObject({ code: 'unavailable' });
  });
});

describe('manual entry', () => {
  it('validates and builds a Paper', () => {
    const v = manualPaperSchema.parse(draftToInput(emptyDraft({ title: ' My paper ', authors: 'Ada Lovelace\nAlan Turing; Grace Hopper', year: '2020', doi: 'https://doi.org/10.1234/ABC' })));
    expect(manualDetails(v)).toMatchObject({ title: 'My paper', year: 2020, doi: '10.1234/abc', authors: [{ name: 'Ada Lovelace' }, { name: 'Alan Turing' }, { name: 'Grace Hopper' }] });
  });

  it('rejects bad input with readable messages', () => {
    const bad = (over: object) => manualPaperSchema.safeParse({ ...draftToInput(emptyDraft({ title: 'x' })), ...over });
    expect(bad({ title: '' }).error?.issues[0].message).toBe('Give the paper a title.');
    expect(bad({ doi: 'not a doi' }).error?.issues[0].message).toContain('DOI');
    expect(bad({ url: 'javascript:alert(1)' }).error?.issues[0].message).toContain('http');
    expect(bad({ year: 3500 }).success).toBe(false);
  });
});

describe.skipIf(!TEST_DB_URL)('adding by hand and editing (Postgres)', () => {
  let db: TestDb;
  let user: string;
  beforeAll(async () => {
    db = await openTestDb();
    user = await db.addUser();
  });
  afterAll(async () => db?.close());

  const input = (over: object = {}) => manualPaperSchema.parse({ ...draftToInput(emptyDraft({ title: 'Field notes', authors: 'A. Person', year: '2019' })), ...over });

  it('adds a private "manual" paper', async () => {
    const item = await saveManualPaper(db.pool, user, input());
    expect(item).toMatchObject({ addedVia: 'manual', paper: { origin: 'manual', provider: null, record: null, title: 'Field notes', year: 2019 } });
  });

  it('blocks a manual paper whose DOI is already saved', async () => {
    await saveManualPaper(db.pool, user, input({ doi: '10.5555/dup' }));
    await expect(saveManualPaper(db.pool, user, input({ doi: 'https://doi.org/10.5555/DUP' }))).rejects.toMatchObject({ code: 'duplicate' });
  });

  it('saves a looked-up paper with how it was found', async () => {
    const { client } = fakeClient(() => work('W77'));
    const r = await saveFoundPaper({ db: db.pool, sources: client }, user, { paperId: 'openalex:W77', via: 'link' });
    expect(r.item.addedVia).toBe('link');
  });

  it('edits manual details but never those from a paper provider', async () => {
    const item = await saveManualPaper(db.pool, user, input({ title: 'Typo' }));
    expect((await editDetails(db.pool, user, item.id, input({ title: 'Fixed' }))).paper.title).toBe('Fixed');
    const { client } = fakeClient(() => work('W78'));
    const oa = (await saveFoundPaper({ db: db.pool, sources: client }, user, { paperId: 'openalex:W78' })).item;
    await expect(editDetails(db.pool, user, oa.id, input())).rejects.toMatchObject({ code: 'bad_request' });
    await expect(editDetails(db.pool, user, item.id, input({ doi: '10.1000/w78' }))).rejects.toMatchObject({ code: 'duplicate' });
    const stranger = await db.addUser();
    await expect(editDetails(db.pool, stranger, item.id, input())).rejects.toMatchObject({ code: 'not_found' });
  });
});
