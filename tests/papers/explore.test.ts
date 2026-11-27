import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { exploreCounts, exploreList, passes, resetExploreCache, type ExploreDeps } from '@/lib/papers/explore/feed';
import { parseExploreQuery, type ExploreQuery } from '@/lib/papers/explore/query';
import { pgPaperCopy } from '@/lib/papers/local/pg';
import { PAPERS_LOCAL_SQL } from '@/lib/papers/local/schema';
import { paperSources } from '@/lib/providers/papers/sources';
import type { PaperSource } from '@/lib/providers/papers/types';
import { paper } from '../shelf/fixtures';

/* The Explore feed: its request, the feed and filter counts over our copy, and
   the live fallback while the copy is off or nearly empty. The copy part needs
   TEST_DATABASE_URL (a test database, never the app's own). */

const q = (qs: string): ExploreQuery => parseExploreQuery(new URLSearchParams(qs));

describe('explore request', () => {
  it('reads subject, sort, filters (lists by repeat or comma) and page', () => {
    expect(q('subject=Medicine&sort=cited&type=review,article&source=arxiv&source=pubmed&from=2024&to=2020&oa=1&pdf=1&abstract=1&minCites=100&lang=EN&page=3')).toEqual({
      subject: 'Medicine',
      sort: 'cited',
      types: ['review', 'article'],
      sources: ['arxiv', 'pubmed'],
      yearFrom: 2020,
      yearTo: 2024, // swapped into order
      openAccess: true,
      hasPdf: true,
      hasAbstract: true,
      minCitations: 100,
      language: 'en',
      page: 3,
    });
    expect(q('')).toMatchObject({ sort: 'trending', subject: null, types: [], page: 1, minCitations: null });
    expect(() => q('sort=random')).toThrow();
    expect(() => q('type=poem')).toThrow();
  });

  it('applies the filters to papers the live listing returns', () => {
    const f = q('subject=Medicine&from=2020&pdf=1');
    expect(passes(paper('W1', { subject: 'Medicine', year: 2021, pdfUrl: 'https://x/p.pdf' }), f)).toBe(true);
    expect(passes(paper('W1', { subject: 'Physics and Astronomy', year: 2021, pdfUrl: 'https://x/p.pdf' }), f)).toBe(false);
    expect(passes(paper('W1', { subject: 'Medicine', year: 2021, pdfUrl: null }), f)).toBe(false);
    expect(passes(paper('W1', { isRetracted: true }), q(''))).toBe(false);
  });
});

describe('live fallback (copy off)', () => {
  it('lists the primary source’s most cited or newest papers, filtered, without counts', async () => {
    const browsed: unknown[] = [];
    const source = {
      name: 'openalex',
      limits: { maxQueryChars: 1500, semanticMax: 50 },
      parseId: () => null,
      search: async () => ({ papers: [], total: 0, costUsd: 0 }),
      getPaper: async () => ({ paper: null, costUsd: 0 }),
      browse: async (b: unknown) => (browsed.push(b), { papers: [paper('W1', { subject: 'Medicine' }), paper('W2', { subject: 'Physics and Astronomy' })], next: 'c2', costUsd: 0 }),
    } as PaperSource;
    const d: ExploreDeps = { db: null as never, copyEnabled: false, sources: () => paperSources([source]) };
    const list = await exploreList(d, q('subject=Medicine&sort=newest'));
    expect(list).toMatchObject({ from: 'live', hasMore: true, papers: [{ id: 'openalex:W1' }] });
    expect(browsed[0]).toMatchObject({ order: 'newest', cursor: null });
    expect(await exploreCounts(d, q(''))).toBeNull();
  });
});

const TEST_DB_URL = process.env.TEST_DATABASE_URL?.trim() || '';

describe.skipIf(!TEST_DB_URL)('explore over the copy (postgres)', () => {
  let pool: Pool;
  let schema: string;
  let d: ExploreDeps;

  beforeAll(async () => {
    schema = `papers_explore_test_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const admin = new Pool({ connectionString: TEST_DB_URL, max: 1 });
    await admin.query(`create schema ${schema}`);
    await admin.end();
    pool = new Pool({ connectionString: TEST_DB_URL, max: 4, options: `-c search_path=${schema}` });
    await pool.query(PAPERS_LOCAL_SQL);
    const copy = pgPaperCopy(pool);
    const year = new Date().getUTCFullYear();
    // 200 downloaded papers (not seen), across subjects, types and years
    const subjects = ['Medicine', 'Computer Science', 'Physics and Astronomy'];
    await copy.save(
      Array.from({ length: 200 }, (_, i) =>
        paper(`S${i}`, {
          subject: subjects[i % 3],
          type: i % 4 === 0 ? 'review' : 'article',
          year: year - (i % 5),
          citedByCount: i * 10,
          isOpenAccess: i % 2 === 0,
          pdfUrl: i % 10 === 0 ? `https://x/${i}.pdf` : null,
          isRetracted: i === 199,
        }),
      ),
      { detail: false, origin: 'seed:openalex', seen: false },
    );
    // papers users looked at this week: S8 twice, S7 once
    // (the same records again, as users would see them)
    await copy.save(
      [paper('S7', { subject: subjects[7 % 3], type: 'article', year: year - 2, citedByCount: 70, isOpenAccess: false }), paper('S8', { subject: subjects[8 % 3], type: 'review', year: year - 3, citedByCount: 80 })],
      { detail: false, origin: 'live' },
    );
    await copy.touch(['openalex:S8']);
    d = { db: pool, copyEnabled: true, sources: () => paperSources([]) as never };
  });
  beforeEach(() => resetExploreCache());
  afterAll(async () => {
    await pool?.query(`drop schema ${schema} cascade`);
    await pool?.end();
  });

  it('trending puts what users saw this week first, most seen first, then the most cited', async () => {
    const list = await exploreList(d, q(''));
    expect(list).toMatchObject({ from: 'copy', total: 199, perPage: 24, hasMore: true });
    expect(list.papers.slice(0, 3).map((p) => p.id)).toEqual(['openalex:S8', 'openalex:S7', 'openalex:S198']);
  });

  it('filters, sorts and pages', async () => {
    const med = await exploreList(d, q('subject=Medicine&type=review&sort=cited'));
    expect(med.papers.every((p) => p.subject === 'Medicine' && p.type === 'review')).toBe(true);
    expect(med.papers[0].citedByCount).toBeGreaterThan(med.papers[1].citedByCount);
    const free = await exploreList(d, q('sort=free'));
    expect(free.total).toBe(20);
    expect(free.papers.every((p) => p.pdfUrl)).toBe(true);
    const last = await exploreList(d, q('page=10')); // 199 papers, 24 a page: page 9 is the last
    expect(last).toMatchObject({ papers: [], total: 199, hasMore: false });
  });

  it('counts each filter’s choices with the other filters applied', async () => {
    const f = await exploreCounts(d, q('subject=Medicine&type=review'));
    expect(f).not.toBeNull();
    // subjects ignore the subject filter but keep the type filter: every 4th of the 199 shown is a review
    expect(f!.subjects.map((s) => s.value).sort()).toEqual(['Computer Science', 'Medicine', 'Physics and Astronomy']);
    expect(f!.subjects.reduce((n, s) => n + s.count, 0)).toBe(50);
    // types ignore the type filter but keep the subject one
    expect(f!.types.map((t) => t.value).sort()).toEqual(['article', 'review']);
    expect(f!.years).toHaveLength(15);
    expect(f!.citations.map((c) => c.value)).toEqual(['10', '100', '1000']);
    expect(f!.total).toBe((await exploreList(d, q('subject=Medicine&type=review'))).total);
  });
});
