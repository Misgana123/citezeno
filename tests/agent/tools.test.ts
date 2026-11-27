import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AgentContext } from '@/lib/agent/context';
import { AGENT_TOOLS, findTool, offeredTools, toolSpecs } from '@/lib/agent/tools';
import { runTool } from '@/lib/agent/tools/run';
import { toGeminiSchema } from '@/lib/providers/gemini/schema';
import type { QueryParams } from '@/lib/providers/openalex/client';
import { ProviderError } from '@/lib/providers/errors';
import { shelfConfig } from '@/lib/shelf/config';
import { sourcesOver } from '../papers/fake-openalex';
import { openTestDb, TEST_DB_URL, type TestDb } from '../shelf/testdb';

const work = (id: string, over: Record<string, unknown> = {}) => ({
  id: `https://openalex.org/${id}`,
  display_name: `Paper ${id}`,
  doi: `https://doi.org/10.1000/${id.toLowerCase()}`,
  publication_year: 2020,
  authorships: [{ author: { display_name: 'Ada Lovelace' } }],
  ...over,
});

/* A fake OpenAlex: single works by path, lists for everything else. */
function openAlex(impl?: (path: string, params: QueryParams) => unknown) {
  const get = vi.fn(async (path: string, params: QueryParams = {}) => {
    const body = impl ? impl(path, params) : path.startsWith('/works/') ? work(path.split('/').pop()!.replace(/^doi:.*/, 'W77')) : { meta: { count: 2 }, results: [work('W1'), work('W2', { is_retracted: true })] };
    if (body instanceof Error) throw body;
    return { body, costUsd: 0, status: 200 };
  });
  return get;
}

function context(userId: string, db: unknown, get = openAlex()): AgentContext & { reserveSearches: ReturnType<typeof vi.fn> } {
  return {
    userId,
    db: db as AgentContext['db'],
    sources: () => sourcesOver(get as never),
    papersConfig: { maxQueryChars: 1500, dailySearchesPerUser: 100 },
    shelfConfig: shelfConfig({}),
    reserveSearches: vi.fn(async () => {}),
    files: { save: vi.fn(async () => { throw new Error('no files in this test'); }), read: vi.fn(async () => null), readShelfPdf: vi.fn(async () => null) },
    webSearch: () => null, webFiles: () => { throw new Error('no web in this test'); }, pdfText: () => { throw new Error('no PDFs in this test'); }, chatAttachments: async () => [], code: () => null,
  };
}

describe('the tool registry', () => {
  it('has one well-formed tool per user action', () => {
    const names = AGENT_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of AGENT_TOOLS) {
      expect(t.name).toMatch(/^[a-z][a-z_]{2,63}$/);
      expect(t.description.length).toBeGreaterThan(20);
      expect(['read', 'write']).toContain(t.kind);
    }
    for (const n of ['search_papers', 'get_paper', 'get_references', 'get_citing_papers', 'find_similar_papers', 'list_library', 'lookup_paper', 'save_paper', 'organize_papers', 'delete_papers', 'resolve_duplicate', 'export_library', 'create_project', 'clean_references', 'check_references', 'text_stats', 'shelf_stats', 'zip_files']) {
      expect(findTool(n)).toBeTruthy();
    }
  });

  it('describes every input as an object schema every vendor accepts', () => {
    for (const spec of toolSpecs()) {
      expect(spec.parameters).toMatchObject({ type: 'object' });
      expect(spec.parameters).not.toHaveProperty('$schema');
      const gemini = JSON.stringify(toGeminiSchema(spec.parameters));
      expect(gemini).not.toMatch(/additionalProperties|\$schema|anyOf/);
    }
  });

  it('asks before deleting, merging and changing many papers, never before reading', () => {
    for (const t of AGENT_TOOLS.filter((t) => t.kind === 'read' && t.name !== 'export_library')) expect(t.confirm).toBeUndefined();
    for (const n of ['delete_papers', 'resolve_duplicate', 'organize_papers', 'delete_project', 'delete_folder', 'delete_tag', 'export_library']) expect((findTool(n) as { confirm?: unknown })?.confirm).toBeTruthy();
  });
});

describe('running tools', () => {
  it('rejects unknown tools and invalid input in words the model can use', async () => {
    const ctx = context('u1', null);
    expect((await runTool(ctx, 'hack_the_planet', {})).outcome).toMatchObject({ status: 'error', code: 'bad_request' });
    const r = await runTool(ctx, 'search_papers', { mode: 'keyword' });
    expect(r.outcome).toMatchObject({ status: 'error', message: expect.stringContaining('query') });
  });

  it('searches like Find Papers: same validation, limits and results, retractions flagged', async () => {
    const get = openAlex();
    const ctx = context('u1', null, get);
    const r = await runTool(ctx, 'search_papers', { query: 'sleep and memory', mode: 'keyword', yearFrom: 2015, openAccessOnly: true });
    expect(r.label).toBe('Searching papers for “sleep and memory”');
    expect(ctx.reserveSearches).toHaveBeenCalledWith(1);
    expect(get.mock.calls[0][1]).toMatchObject({ search: 'sleep and memory', filter: expect.stringContaining('is_oa:true') });
    expect(r.outcome).toMatchObject({ status: 'done', output: { result: { total: 2, papers: [{ paperId: 'openalex:W1' }, { paperId: 'openalex:W2', retracted: true }] }, display: { papers: [{}, {}] } } });

    await runTool(ctx, 'search_papers', { query: 'x' });
    expect(ctx.reserveSearches).toHaveBeenLastCalledWith(2); // smart runs two searches
  });

  it('opens papers and their lists by paper ID', async () => {
    const ctx = context('u1', null);
    const r = await runTool(ctx, 'get_paper', { paperId: 'openalex:W9' });
    expect(r.outcome).toMatchObject({ status: 'done', output: { result: { paperId: 'openalex:W9', title: 'Paper W9' } } });
    expect((await runTool(ctx, 'get_references', { paperId: 'openalex:W9', sort: 'newest' })).outcome).toMatchObject({ status: 'done' });
    expect((await runTool(ctx, 'get_paper', { paperId: 'nonsense' })).outcome).toMatchObject({ status: 'error', code: 'bad_request' });
  });

  it('passes on outages as plain messages', async () => {
    const ctx = context('u1', null, openAlex(() => new ProviderError('unavailable', 'down')));
    expect((await runTool(ctx, 'get_paper', { paperId: 'openalex:W9' })).outcome).toMatchObject({ status: 'error', code: 'unavailable', message: expect.stringContaining('temporarily unavailable') });
  });
});

describe.skipIf(!TEST_DB_URL)('shelf tools (Postgres)', () => {
  let db: TestDb;
  let user: string;
  let other: string;
  const ctx = () => context(user, db.pool);
  const done = (r: { outcome: unknown }) => (r.outcome as { status: string; output: { result: Record<string, unknown> } }).output.result;

  beforeAll(async () => {
    db = await openTestDb();
    user = await db.addUser();
    other = await db.addUser();
  });
  afterAll(async () => db?.close());

  it('saves papers, reports ones already saved, and finds them on the shelf', async () => {
    const project = done(await runTool(ctx(), 'create_project', { name: 'Thesis' }));
    const saved = done(await runTool(ctx(), 'save_paper', { paperId: 'openalex:W1', projectId: project.projectId }));
    expect(saved).toMatchObject({ saved: { paperId: 'openalex:W1', projects: ['Thesis'] } });
    expect(done(await runTool(ctx(), 'save_paper', { paperId: 'openalex:W1' }))).toMatchObject({ alreadyOnShelf: true });

    const list = done(await runTool(ctx(), 'list_library', { projectId: project.projectId as string }));
    expect(list).toMatchObject({ total: 1, items: [{ title: 'Paper W1' }] });
    // another user's shelf is invisible
    expect(done(await runTool(context(other, db.pool), 'list_library', {}))).toMatchObject({ total: 0 });
  });

  it('looks papers up by DOI and adds by hand', async () => {
    const r = done(await runTool(ctx(), 'lookup_paper', { input: '10.1000/w77' }));
    expect(r).toMatchObject({ via: 'doi', papers: [{ paperId: 'openalex:W77', savedItemId: null }] });
    const manual = done(await runTool(ctx(), 'add_paper_manually', { details: { title: 'Field notes on rivers', authors: ['Me'], year: 2021 } }));
    expect(manual).toMatchObject({ saved: { title: 'Field notes on rivers' } });
  });

  it('tags by name, sets notes and status', async () => {
    const { items } = done(await runTool(ctx(), 'list_library', {})) as { items: { itemId: string }[] };
    const ids = items.map((i) => i.itemId);
    const tagged = done(await runTool(ctx(), 'organize_papers', { itemIds: ids, action: 'tag', tagNames: ['memory'] }));
    expect(tagged).toMatchObject({ changed: ids.length });
    const note = done(await runTool(ctx(), 'update_library_item', { itemId: ids[0], note: 'Key paper', readingStatus: 'reading' }));
    expect(note).toMatchObject({ note: 'Key paper', readingStatus: 'reading', tags: ['memory'] });
  });

  it('asks before deleting, and deletes once confirmed', async () => {
    const { items } = done(await runTool(ctx(), 'list_library', { search: 'Field notes' })) as { items: { itemId: string }[] };
    const first = await runTool(ctx(), 'delete_papers', { itemIds: [items[0].itemId] });
    expect(first.outcome).toEqual({ status: 'needs_confirmation', question: expect.stringContaining('“Field notes on rivers”') });
    expect(done(await runTool(ctx(), 'list_library', { search: 'Field notes' }))).toMatchObject({ total: 1 });
    expect(done(await runTool(ctx(), 'delete_papers', { itemIds: [items[0].itemId] }, { confirmed: true }))).toEqual({ deleted: 1 });
    // someone else's item can't be deleted
    const mine = (done(await runTool(ctx(), 'list_library', {})) as { items: { itemId: string }[] }).items[0].itemId;
    expect(done(await runTool(context(other, db.pool), 'delete_papers', { itemIds: [mine] }, { confirmed: true }))).toEqual({ deleted: 0 });
  });

  it('asks before changing many papers at once', async () => {
    const r = await runTool(ctx(), 'organize_papers', { itemIds: Array.from({ length: 11 }, (_, i) => `i_${i}`), action: 'set_status', status: 'done' });
    expect(r.outcome).toEqual({ status: 'needs_confirmation', question: 'Mark these 11 papers as done?' });
  });

  it('exports a file the user can download', async () => {
    const r = await runTool(ctx(), 'export_library', { format: 'bibtex' });
    expect(r.outcome).toMatchObject({ status: 'done', output: { result: { exported: 1 }, display: { file: { name: expect.stringMatching(/\.bib$/), text: expect.stringContaining('Paper W1') } } } });
  });

  it('counts the shelf by year, journal, author and title words, with the list filters', async () => {
    await runTool(ctx(), 'add_paper_manually', { details: { title: 'Field notes on rivers', authors: ['Me'], year: 2021 } });
    const stats = done(await runTool(ctx(), 'shelf_stats', {}));
    expect(stats).toMatchObject({ total: 2, byYear: [{ year: 2020, count: 1 }, { year: 2021, count: 1 }], noYear: 0, authors: [{ name: 'Ada Lovelace', count: 1 }, { name: 'Me', count: 1 }] });
    expect(stats.titleWords).toEqual(expect.arrayContaining([{ name: 'rivers', count: 1 }, { name: 'paper', count: 1 }]));
    expect(stats.titleWords).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'on' })]));
    expect(done(await runTool(ctx(), 'shelf_stats', { yearFrom: 2021 }))).toMatchObject({ total: 1, byYear: [{ year: 2021, count: 1 }] });
    expect(done(await runTool(context(other, db.pool), 'shelf_stats', {}))).toMatchObject({ total: 0, byYear: [], authors: [] });
  });

  it('lists projects, folders and tags with IDs', async () => {
    const c = done(await runTool(ctx(), 'list_collections', {}));
    expect(c).toMatchObject({ projects: [{ name: 'Thesis', papers: 1 }], tags: [{ name: 'memory' }] });
    const del = await runTool(ctx(), 'delete_project', { projectId: (c.projects as { projectId: string }[])[0].projectId });
    expect(del.outcome).toMatchObject({ status: 'needs_confirmation', question: expect.stringContaining('“Thesis”') });
  });
});

describe('web tools', () => {
  const page = { title: 'WHO: sleep', text: 'Adults need 7 hours. '.repeat(1000), finalUrl: 'https://who.int/sleep' };
  const web = (over: Partial<AgentContext> = {}): AgentContext => ({
    ...context('u1', null),
    webSearch: () => ({ name: 'fake', search: vi.fn(async () => [{ title: 'WHO', url: 'https://who.int/sleep', snippet: 'Adults need 7 hours', published: '2025-11-04' }]) }),
    webFiles: () => ({ name: 'fake', fetchPdf: vi.fn(), fetchPage: vi.fn(async () => page) }),
    ...over,
  });

  it('are offered only while web search is on', () => {
    const names = (web: boolean) => offeredTools({ web }).map((t) => t.name);
    expect(names(false)).not.toContain('web_search');
    expect(names(false)).not.toContain('web_fetch');
    expect(names(false)).toContain('search_papers');
    expect(names(true)).toEqual(expect.arrayContaining(['web_search', 'web_fetch', 'search_papers', 'find_citations']));
  });

  it('searches the web and shows the pages found', async () => {
    const r = await runTool(web(), 'web_search', { query: 'how much sleep do adults need' });
    expect(r.label).toBe('Searching the web for “how much sleep do adults need”');
    expect(r.outcome).toMatchObject({ status: 'done', output: { result: { results: [{ n: 1, url: 'https://who.int/sleep' }] }, display: { links: [{ title: 'WHO', url: 'https://who.int/sleep' }], summary: '1 result' } } });
  });

  it('says web search isn’t set up when there is no key', async () => {
    const r = await runTool(web({ webSearch: () => null }), 'web_search', { query: 'sleep' });
    expect(r.outcome).toMatchObject({ status: 'error', message: 'Web search isn’t set up yet.' });
  });

  it('reads a page, cut to the length asked for', async () => {
    const r = await runTool(web(), 'web_fetch', { url: 'https://who.int/sleep', maxChars: 1000 });
    expect(r.label).toBe('Reading who.int/sleep');
    const out = (r.outcome as { output: { result: { text: string; cut: boolean; totalChars: number } } }).output;
    expect(out.result.text).toHaveLength(1000);
    expect(out.result).toMatchObject({ cut: true, totalChars: page.text.length });
  });

  it('reads an online PDF with the PDF text job', async () => {
    const pdfBytes = new TextEncoder().encode('%PDF-1.7 fake');
    const ctx = web({
      webFiles: () => ({
        name: 'fake',
        fetchPage: vi.fn(async () => {
          throw new ProviderError('bad_request', 'pdf', { reason: 'is_pdf' });
        }),
        fetchPdf: vi.fn(async () => ({ stream: new Blob([pdfBytes]).stream(), size: pdfBytes.byteLength, finalUrl: 'https://a.example/r.pdf' })),
      }),
      pdfText: () => ({ name: 'fake', read: vi.fn(async () => ({ pageCount: 1, title: 'Report', doi: null, text: 'The report text.' })) }),
    });
    const r = await runTool(ctx, 'web_fetch', { url: 'https://a.example/r.pdf' });
    expect(r.outcome).toMatchObject({ status: 'done', output: { result: { kind: 'pdf', title: 'Report', text: 'The report text.' }, display: { summary: 'Read PDF' } } });
  });

  it('explains a link it won’t open in words the user can read', async () => {
    const ctx = web({
      webFiles: () => ({
        name: 'fake',
        fetchPdf: vi.fn(),
        fetchPage: vi.fn(async () => {
          throw new ProviderError('bad_request', 'private', { reason: 'blocked' });
        }),
      }),
    });
    const r = await runTool(ctx, 'web_fetch', { url: 'http://10.0.0.1/admin' });
    expect(r.outcome).toMatchObject({ status: 'error', message: 'That link can’t be opened (it isn’t a public web address).' });
  });
});
