import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { localCopyConfig } from '@/lib/papers/local/config';
import { memoryPaperCopy } from '@/lib/papers/local/memory';
import { pgPaperCopy } from '@/lib/papers/local/pg';
import { PAPERS_LOCAL_SQL } from '@/lib/papers/local/schema';
import { rememberingSource } from '@/lib/papers/local/source';
import type { PaperCopyStore } from '@/lib/papers/local/types';
import type { PaperSource } from '@/lib/providers/papers/types';
import { paper } from '../shelf/fixtures';

/* Our own copy of papers: what it keeps, how copies of one paper merge, and
   when it answers instead of the provider. */

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 23, 12);
const arxiv = (id: string, over = {}) => paper(id, { id: `arxiv:${id}`, provider: 'arxiv', record: null, ...over });

/* A paper source that records what it was asked. */
function fakeSource(name = 'openalex'): PaperSource & { calls: string[] } {
  const calls: string[] = [];
  const mk = (id: string) => (name === 'openalex' ? paper(id) : arxiv(id));
  return {
    name,
    calls,
    limits: { maxQueryChars: 1500, semanticMax: 50 },
    parseId: (raw) => raw,
    async search(q) {
      calls.push(`search:${q.text}`);
      return { papers: [mk('W1'), mk('W2')], total: 2, costUsd: 0.001 };
    },
    async getPaper(ref) {
      calls.push(`get:${ref.kind === 'doi' ? ref.doi : ref.kind === 'id' ? ref.id : ref.id}`);
      if (ref.kind === 'id' && ref.id === 'W404') return { paper: null, costUsd: 0 };
      return { paper: mk(ref.kind === 'id' ? ref.id : 'W1'), costUsd: 0 };
    },
    async getPapers(kind, values) {
      calls.push(`batch:${values.join(',')}`);
      return { found: new Map(values.map((v) => [kind === 'doi' ? v.toLowerCase() : v, mk(kind === 'id' ? v : 'W1')])), costUsd: 0.0001 };
    },
  };
}

/* The merge rules, run against any store. */
function mergeRules(name: string, open: () => Promise<{ store: PaperCopyStore; close(): Promise<void> }>) {
  describe(`${name}: keeping papers`, () => {
    let store: PaperCopyStore;
    let close: () => Promise<void>;
    beforeAll(async () => ({ store, close } = await open()));
    afterAll(async () => close());

    it('keeps a paper and finds it by ID and by DOI', async () => {
      await store.save([paper('W10')], { detail: true, origin: 'live' });
      expect((await store.byIds(['openalex:W10'])).get('openalex:W10')?.paper.title).toBe('Paper W10');
      const byDoi = await store.byDois(['10.1000/W10']);
      expect(byDoi.get('10.1000/w10')).toMatchObject({ detail: true, paper: { id: 'openalex:W10' } });
    });

    it('a result card updates the numbers but never wipes full details', async () => {
      await store.save([paper('W11', { topics: ['Genes'], referenceIds: ['openalex:W1'], citedByCount: 5 })], { detail: true, origin: 'live' });
      await store.save([paper('W11', { citedByCount: 9 })], { detail: false, origin: 'live' });
      const kept = (await store.byIds(['openalex:W11'])).get('openalex:W11')!;
      expect(kept.detail).toBe(true);
      expect(kept.paper.citedByCount).toBe(9);
      expect(kept.paper.topics).toEqual(['Genes']);
      expect(kept.paper.referenceIds).toEqual(['openalex:W1']);
    });

    it('another provider with the same DOI joins the same row and only fills gaps', async () => {
      await store.save([paper('W12', { abstract: null, pdfUrl: null })], { detail: true, origin: 'live' });
      await store.save([arxiv('W12', { doi: '10.1000/w12', title: 'Other title', abstract: 'From arXiv.', pdfUrl: 'https://arxiv.org/pdf/w12' })], { detail: false, origin: 'live' });
      const both = await store.byIds(['openalex:W12', 'arxiv:W12']);
      expect(both.get('arxiv:W12')?.paper.id).toBe('openalex:W12'); // one row, still owned by OpenAlex
      expect(both.get('openalex:W12')?.paper).toMatchObject({ title: 'Paper W12', abstract: 'From arXiv.', pdfUrl: 'https://arxiv.org/pdf/w12' });
    });

    it('papers without a DOI are kept under their own ID', async () => {
      await store.save([paper('W13', { doi: null }), paper('W13', { doi: null })], { detail: false, origin: 'live' });
      expect((await store.byIds(['openalex:W13'])).get('openalex:W13')?.detail).toBe(false);
      expect((await store.byDois(['10.1000/w13'])).size).toBe(0);
    });
  });
}

mergeRules('memory', async () => ({ store: memoryPaperCopy(), close: async () => {} }));

const TEST_DB_URL = process.env.TEST_DATABASE_URL?.trim() || '';

async function pgStore() {
  const schema = `papers_local_test_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const admin = new Pool({ connectionString: TEST_DB_URL, max: 1 });
  await admin.query(`create schema ${schema}`);
  await admin.end();
  const pool = new Pool({ connectionString: TEST_DB_URL, max: 4, options: `-c search_path=${schema}` });
  await pool.query(PAPERS_LOCAL_SQL);
  return {
    pool,
    store: pgPaperCopy(pool),
    async close() {
      await pool.query(`drop schema ${schema} cascade`);
      await pool.end();
    },
  };
}

describe.skipIf(!TEST_DB_URL)('postgres', () => {
  mergeRules('postgres', pgStore);

  it('computes the search and filter columns from the paper', async () => {
    const { pool, store, close } = await pgStore();
    try {
      await store.save([paper('W20', { title: 'CRISPR off-target effects', abstract: 'Guide RNA design.', year: 2021, citedByCount: 42, isRetracted: true })], { detail: false, origin: 'seed:openalex' });
      const { rows } = await pool.query(
        `select provider, doi, title, year, "citedByCount", "isOpenAccess", "isRetracted", "hasAbstract", origin, search @@ websearch_to_tsquery('english', 'crispr guide') as matches from paper_record`,
      );
      expect(rows[0]).toEqual({ provider: 'openalex', doi: '10.1000/w20', title: 'CRISPR off-target effects', year: 2021, citedByCount: 42, isOpenAccess: true, isRetracted: true, hasAbstract: true, origin: 'seed:openalex', matches: true });
    } finally {
      await close();
    }
  });

  it('searches the copy: every word, filters, sorts, pages, and counts past the end', async () => {
    const { store, close } = await pgStore();
    try {
      await store.save(
        [
          paper('W1', { title: 'CRISPR off-target effects in mice', year: 2018, citedByCount: 5 }),
          paper('W2', { title: 'Off-target CRISPR editing in human cells', year: 2022, citedByCount: 50, language: 'en' }),
          paper('W3', { title: 'CRISPR screens', abstract: 'Nothing about targets.', year: 2021, citedByCount: 500 }),
          paper('W4', { title: 'Off-target CRISPR effects, retracted', isRetracted: true }),
        ],
        { detail: false, origin: 'live' },
      );
      const all = await store.search({ text: 'crispr off-target', perPage: 10, filters: { yearFrom: null, yearTo: null, openAccess: false, types: [], language: null, hasAbstract: false, hideRetracted: true, minCitations: null } });
      expect(all.papers.map((p) => p.id).sort()).toEqual(['openalex:W1', 'openalex:W2']);
      expect(all.total).toBe(2);
      const newest = await store.search({ text: 'crispr', sort: 'newest', perPage: 2 });
      expect(newest.papers.map((p) => p.id)).toEqual(['openalex:W2', 'openalex:W3']);
      const fromYear = await store.search({ text: 'crispr', perPage: 10, filters: { yearFrom: 2020, yearTo: null, openAccess: false, types: [], language: null, hasAbstract: false, hideRetracted: false, minCitations: 40 } });
      expect(fromYear.papers.map((p) => p.id).sort()).toEqual(['openalex:W2', 'openalex:W3']);
      const past = await store.search({ text: 'crispr', perPage: 2, page: 5 });
      expect(past).toEqual({ papers: [], total: 4, costUsd: 0 });
    } finally {
      await close();
    }
  });

  it('saves from many requests at once without deadlocks, counting each sighting', async () => {
    const { pool, store, close } = await pgStore();
    try {
      const batch = (i: number) => (i % 2 ? [paper('W1'), paper('W2'), paper('W3')] : [paper('W3'), paper('W2'), paper('W1')]);
      await Promise.all(Array.from({ length: 12 }, (_, i) => store.save(batch(i), { detail: false, origin: 'live' })));
      const { rows } = await pool.query<{ hits: number }>(`select hits from paper_record order by key`);
      expect(rows.map((r) => r.hits)).toEqual([12, 12, 12]);
      await store.touch(['openalex:W1']);
      expect((await pool.query(`select hits from paper_record where 'openalex:W1' = any(ids)`)).rows[0].hits).toBe(13);
    } finally {
      await close();
    }
  });
});

describe('remembering source', () => {
  const opts = (now = () => NOW) => ({ freshMs: 7 * DAY, now });

  it('keeps every paper a search returns, as result cards', async () => {
    const store = memoryPaperCopy(() => NOW);
    const s = rememberingSource(fakeSource(), store, opts());
    await s.search({ text: 'genes', perPage: 25 });
    expect([...store.rows.values()].map((r) => [r.data.id, r.detail])).toEqual([
      ['openalex:W1', false],
      ['openalex:W2', false],
    ]);
  });

  it('answers a paper from the copy when it has full details and is fresh enough', async () => {
    let now = NOW;
    const store = memoryPaperCopy(() => now);
    const src = fakeSource();
    const s = rememberingSource(src, store, opts(() => now));
    await s.getPaper({ kind: 'id', id: 'W5' }); // live, kept with details
    await expect(s.getPaper({ kind: 'id', id: 'W5' })).resolves.toMatchObject({ paper: { id: 'openalex:W5' }, costUsd: 0 });
    await expect(s.getPaper({ kind: 'doi', doi: '10.1000/W5' })).resolves.toMatchObject({ paper: { id: 'openalex:W5' }, costUsd: 0 });
    expect(src.calls).toEqual(['get:W5']);
    now += 8 * DAY; // too old: asked again
    await s.getPaper({ kind: 'id', id: 'W5' });
    expect(src.calls).toEqual(['get:W5', 'get:W5']);
  });

  it('result cards and other providers’ records are not served as a paper', async () => {
    const store = memoryPaperCopy(() => NOW);
    const src = fakeSource();
    const s = rememberingSource(src, store, opts());
    await s.search({ text: 'x', perPage: 25 }); // W1, W2 as cards
    await s.getPaper({ kind: 'id', id: 'W1' });
    expect(src.calls).toEqual(['search:x', 'get:W1']);
    await store.save([arxiv('A1', { doi: '10.1000/a1' })], { detail: true, origin: 'live' });
    await s.getPaper({ kind: 'doi', doi: '10.1000/a1' });
    expect(src.calls).toContain('get:10.1000/a1');
  });

  it('a batch takes what the copy has and asks the provider for the rest', async () => {
    const store = memoryPaperCopy(() => NOW);
    const src = fakeSource();
    const s = rememberingSource(src, store, opts());
    await s.getPaper({ kind: 'id', id: 'W7' });
    const r = await s.getPapers!('id', ['W7', 'W8', 'W8']);
    expect([...r.found.keys()].sort()).toEqual(['W7', 'W8']);
    expect(src.calls).toEqual(['get:W7', 'batch:W8']);
    expect(r.costUsd).toBe(0.0001);
    const again = await s.getPapers!('id', ['W7', 'W8']);
    expect(again.costUsd).toBe(0);
    expect(src.calls).toHaveLength(2);
  });

  it('when the copy fails, the provider answers as before', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fail = async () => {
      throw new Error('db down');
    };
    const broken: PaperCopyStore = { save: fail, byIds: fail, byDois: fail, touch: fail, search: fail };
    const src = fakeSource();
    const s = rememberingSource(src, broken, opts());
    await expect(s.search({ text: 'x', perPage: 25 })).resolves.toMatchObject({ total: 2 });
    await expect(s.getPaper({ kind: 'id', id: 'W1' })).resolves.toMatchObject({ paper: { id: 'openalex:W1' } });
    await expect(s.getPapers!('doi', ['10.1000/w1'])).resolves.toMatchObject({ costUsd: 0.0001 });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a paper that does not exist is not kept', async () => {
    const store = memoryPaperCopy(() => NOW);
    const s = rememberingSource(fakeSource(), store, opts());
    await expect(s.getPaper({ kind: 'id', id: 'W404' })).resolves.toEqual({ paper: null, costUsd: 0 });
    expect(store.rows.size).toBe(0);
  });

  it('is off unless turned on; searching it first needs the copy too', () => {
    expect(localCopyConfig({})).toEqual({ enabled: false, freshDays: 7, searchFirst: false, minResults: 50 });
    expect(localCopyConfig({ PAPERS_LOCAL_FIRST: '1' }).searchFirst).toBe(false);
    expect(localCopyConfig({ PAPERS_LOCAL_COPY: '1', PAPERS_LOCAL_FRESH_DAYS: '3', PAPERS_LOCAL_FIRST: 'true', PAPERS_LOCAL_MIN_RESULTS: '20' })).toEqual({ enabled: true, freshDays: 3, searchFirst: true, minResults: 20 });
  });
});
