import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { localCopyConfig, seedPlans, type LocalCopyConfig } from '@/lib/papers/local/config';
import { fillStep, refreshStep, runCopyJobs, seedStep, trimStep, type CopyJobDeps } from '@/lib/papers/local/jobs/runner';
import { copySize } from '@/lib/papers/local/maintain';
import { pgPaperCopy } from '@/lib/papers/local/pg';
import { PAPERS_LOCAL_SQL } from '@/lib/papers/local/schema';
import { syncState } from '@/lib/papers/local/sync';
import type { Paper } from '@/lib/papers/types';
import type { PaperEnricher } from '@/lib/providers/enrich/types';
import { paperSources } from '@/lib/providers/papers/sources';
import type { BrowseQuery, PaperSource } from '@/lib/providers/papers/types';
import { paper } from '../shelf/fixtures';

/* The background jobs that fill and maintain our copy of papers, on real SQL
   in a throwaway schema. Set TEST_DATABASE_URL to run the database parts. */

const NOW = Date.UTC(2026, 10, 23, 12);

describe('download plans', () => {
  it('splits ~100k: most-cited OpenAlex, newest arXiv and PubMed (via Europe PMC), last 3 years', () => {
    expect(seedPlans({}, NOW)).toEqual([
      { source: 'openalex', order: 'cited', target: 50_000, sinceYear: null },
      { source: 'arxiv', order: 'newest', target: 25_000, sinceYear: 2024 },
      { source: 'europepmc', order: 'newest', target: 25_000, sinceYear: 2024 },
    ]);
    expect(seedPlans({ PAPERS_SEED_ARXIV: '0', PAPERS_SEED_OPENALEX: '1000', PAPERS_SEED_YEARS: '1' }, NOW).map((p) => [p.source, p.target, p.sinceYear])).toEqual([
      ['openalex', 1000, null],
      ['europepmc', 25_000, 2026],
    ]);
    expect(localCopyConfig({}, NOW)).toMatchObject({ enabled: false, syncEveryHours: 12, refreshDays: 30, fillBatch: 20, maxRows: 150_000, maxBytes: 500 * 1024 * 1024 });
  });

  it('does nothing while the copy is off', async () => {
    await expect(runCopyJobs({ config: localCopyConfig({}) } as CopyJobDeps, 1000)).resolves.toEqual({ skipped: 'PAPERS_LOCAL_COPY is off' });
  });
});

const TEST_DB_URL = process.env.TEST_DATABASE_URL?.trim() || '';

/* A browsable source: `total` papers, handed out `perPage` at a time by cursor. */
function browsable(name: string, total: number, opts: { fail?: boolean } = {}): PaperSource & { browsed: BrowseQuery[] } {
  const browsed: BrowseQuery[] = [];
  const mk = (i: number) => paper(`${name === 'openalex' ? 'W' : 'X'}${i}`, { id: `${name}:${name === 'openalex' ? 'W' : 'X'}${i}`, provider: name, doi: `10.1000/${name}.${i}`, citedByCount: total - i });
  return {
    name,
    browsed,
    limits: { maxQueryChars: 1500, semanticMax: 0 },
    parseId: () => null,
    search: async () => ({ papers: [], total: 0, costUsd: 0 }),
    getPaper: async () => ({ paper: null, costUsd: 0 }),
    async getPapers(_kind, values) {
      return { found: new Map(values.map((v) => [v, paper(v, { id: `${name}:${v}`, provider: name, title: `Refreshed ${v}`, citedByCount: 999 })])), costUsd: 0 };
    },
    async browse(q) {
      browsed.push(q);
      if (opts.fail) throw new Error('down');
      const start = Number(q.cursor ?? 0);
      const papers = Array.from({ length: Math.max(0, Math.min(q.perPage, total - start)) }, (_, i) => mk(start + i));
      return { papers, next: start + papers.length < total ? String(start + papers.length) : null, costUsd: 0 };
    },
  };
}

describe.skipIf(!TEST_DB_URL)('copy jobs (postgres)', () => {
  let open: { pool: Pool; close(): Promise<void> } | null = null;
  afterEach(async () => {
    await open?.close();
    open = null;
  });

  async function setup(sources: PaperSource[], config: Partial<LocalCopyConfig> = {}, enrichers: PaperEnricher[] = []) {
    const schema = `papers_jobs_test_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const admin = new Pool({ connectionString: TEST_DB_URL, max: 1 });
    await admin.query(`create schema ${schema}`);
    await admin.end();
    const pool = new Pool({ connectionString: TEST_DB_URL, max: 4, options: `-c search_path=${schema}` });
    await pool.query(PAPERS_LOCAL_SQL);
    open = {
      pool,
      async close() {
        await pool.query(`drop schema ${schema} cascade`);
        await pool.end();
      },
    };
    let now = NOW;
    const deps: CopyJobDeps = {
      db: pool,
      copy: pgPaperCopy(pool),
      sources: () => paperSources(sources),
      enrichers: () => enrichers,
      config: { ...localCopyConfig({ PAPERS_LOCAL_COPY: '1' }, NOW), ...config },
      now: () => now,
    };
    return { pool, deps, tick: (ms: number) => (now += ms) };
  }

  it('downloads a page at a time, resumes where it stopped, then marks itself complete', async () => {
    const oa = browsable('openalex', 450);
    const { pool, deps, tick } = await setup([oa], { seeds: [{ source: 'openalex', order: 'cited', target: 1000, sinceYear: null }] });
    const browse = oa.browse!.bind(oa);
    oa.browse = async (q) => (tick(1000), browse(q)); // each page takes a second
    // a short run: only time for one page
    await seedStep(deps, NOW + 2500);
    expect((await syncState(pool, 'openalex')).fetched).toBe(200);
    await seedStep(deps, NOW + 60_000);
    const s = await syncState(pool, 'openalex');
    expect(s).toMatchObject({ fetched: 450, cursor: null, lastError: null });
    expect(s.doneAt).not.toBeNull();
    expect(oa.browsed.map((q) => q.cursor)).toEqual([null, '200', '400']);
    expect(oa.browsed[0]).toMatchObject({ order: 'cited', perPage: 200 });
    const { rows } = await pool.query(`select count(*)::int as n, min(origin) as origin, max(hits) as hits from paper_record`);
    expect(rows[0]).toEqual({ n: 450, origin: 'seed:openalex', hits: 0 }); // downloaded, not yet seen by anyone
  });

  it('stops at its target; a "newest" download tops up every few hours, a "most cited" one does not', async () => {
    const arxiv = browsable('arxiv', 10_000);
    const oa = browsable('openalex', 10_000);
    const { deps, tick } = await setup([oa, arxiv], {
      syncEveryHours: 12,
      seeds: [
        { source: 'openalex', order: 'cited', target: 300, sinceYear: null },
        { source: 'arxiv', order: 'newest', target: 300, sinceYear: 2024 },
      ],
    });
    await seedStep(deps, NOW + 60_000);
    expect(oa.browsed).toHaveLength(2);
    expect(arxiv.browsed).toHaveLength(2);
    tick(3_600_000);
    await seedStep(deps, NOW + 60_000);
    expect(arxiv.browsed).toHaveLength(2); // too soon
    tick(12 * 3_600_000);
    await seedStep(deps, NOW + 60_000);
    expect(arxiv.browsed).toHaveLength(3);
    expect(arxiv.browsed[2]).toMatchObject({ cursor: null, sinceYear: 2024 });
    expect(oa.browsed).toHaveLength(2);
  });

  it('an empty page is tried again before the download counts as complete', async () => {
    const oa = browsable('openalex', 0);
    const { pool, deps } = await setup([oa], { seeds: [{ source: 'openalex', order: 'cited', target: 100, sinceYear: null }] });
    await expect(seedStep(deps, NOW + 60_000)).resolves.toEqual({ seeded_openalex: 'empty page' });
    expect((await syncState(pool, 'openalex')).doneAt).toBeNull();
    await seedStep(deps, NOW + 60_000);
    expect((await syncState(pool, 'openalex')).doneAt).not.toBeNull();
  });

  it('a raised target resumes a finished download', async () => {
    const oa = browsable('openalex', 1000);
    const plan = { source: 'openalex', order: 'cited' as const, target: 200, sinceYear: null };
    const { pool, deps } = await setup([oa], { seeds: [plan] });
    await seedStep(deps, NOW + 60_000);
    expect(await syncState(pool, 'openalex')).toMatchObject({ fetched: 200, cursor: '200' });
    deps.config = { ...deps.config, seeds: [{ ...plan, target: 400 }] };
    await seedStep(deps, NOW + 60_000);
    expect(await syncState(pool, 'openalex')).toMatchObject({ fetched: 400 });
    expect(oa.browsed.map((q) => q.cursor)).toEqual([null, '200']);
  });

  it('a failed page is noted and retried next run; sources not enabled are skipped', async () => {
    const { pool, deps } = await setup([browsable('openalex', 10, { fail: true })], {
      seeds: [
        { source: 'openalex', order: 'cited', target: 10, sinceYear: null },
        { source: 'arxiv', order: 'newest', target: 10, sinceYear: null },
      ],
    });
    await expect(seedStep(deps, NOW + 60_000)).resolves.toEqual({ seeded_openalex: 'failed', seeded_arxiv: 'not enabled' });
    expect((await syncState(pool, 'openalex')).lastError).toBe('down');
  });

  it('fills gaps once per paper and saves what was found', async () => {
    const lookup = vi.fn(async (dois: string[]) => new Map(dois.map((d) => [d, { pdfUrl: `https://free.org/${d}.pdf`, isOpenAccess: true }])));
    const unpaywall: PaperEnricher = { name: 'unpaywall', fills: ['pdfUrl', 'isOpenAccess'], lookup };
    const { pool, deps } = await setup([], { fillBatch: 2 }, [unpaywall]);
    await deps.copy.save([paper('W1', { pdfUrl: null, citedByCount: 9 }), paper('W2', { pdfUrl: 'https://has.pdf' }), paper('W3', { pdfUrl: null, citedByCount: 1 }), paper('W4', { pdfUrl: null, doi: null })], { detail: false, origin: 'live' });
    await expect(fillStep(deps, NOW + 10_000)).resolves.toEqual({ filled: 2, askedToFill: 2 });
    expect(lookup).toHaveBeenCalledWith(['10.1000/w1', '10.1000/w3']); // most cited first; W2 has a PDF, W4 no DOI
    await expect(fillStep(deps, NOW + 10_000)).resolves.toEqual({ filled: 0 });
    const { rows } = await pool.query(`select data->>'pdfUrl' as pdf from paper_record where key = 'doi:10.1000/w1'`);
    expect(rows[0].pdf).toBe('https://free.org/10.1000/w1.pdf');
  });

  it('rechecks old papers with their provider, keeping full details', async () => {
    const { pool, deps } = await setup([browsable('openalex', 0)], { refreshDays: 30 });
    await deps.copy.save([paper('W1', { topics: ['Kept'] })], { detail: true, origin: 'live' });
    await deps.copy.save([paper('W2', { id: 'gone:W2', provider: 'gone' })], { detail: false, origin: 'live' });
    await pool.query(`update paper_record set "fetchedAt" = now() - interval '40 days'`);
    await expect(refreshStep(deps, NOW + 10_000)).resolves.toEqual({ refreshed: 1, checked: 2 });
    const { rows } = await pool.query(`select data->>'title' as title, data->'topics' as topics, "fetchedAt" > now() - interval '1 minute' as fresh from paper_record order by key`);
    expect(rows).toEqual([
      { title: 'Refreshed W1', topics: ['Kept'], fresh: true },
      { title: 'Paper W2', topics: [], fresh: true }, // its provider isn't enabled: checked, left as is
    ]);
  });

  it('trims the least-seen papers past the row limit', async () => {
    const { pool, deps } = await setup([], { maxRows: 2 });
    await deps.copy.save([paper('W1'), paper('W2'), paper('W3')], { detail: false, origin: 'live' });
    await deps.copy.touch(['openalex:W1', 'openalex:W3']);
    await expect(trimStep(deps, NOW + 1000)).resolves.toEqual({ trimmed: 1 });
    const { rows } = await pool.query(`select key from paper_record order by key`);
    expect(rows.map((r) => r.key)).toEqual(['doi:10.1000/w1', 'doi:10.1000/w3']);
    expect((await copySize(pool)).rows).toBe(2);
  });
});
