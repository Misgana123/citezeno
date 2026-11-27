import type { PaperSources } from '@/lib/providers/papers/sources';
import { cursorPage, MAX_CURSOR_PAGE } from '@/lib/providers/papers/cursor';
import { exploreFacets, exploreFeed } from '../local/explore';
import type { Queryable } from '../local/types';
import type { Paper } from '../types';
import { EXPLORE_PER_PAGE, facetsKey, type ExploreQuery } from './query';
import type { ExploreFacets, ExploreList } from './types';

/* The Explore feed: from our own copy of papers (free, with filter counts)
   when it is on and holds enough papers; otherwise from the primary source's
   own listing (most cited or newest, through the gateway and its cache), with
   the filters applied to what comes back and no counts. */

export const MIN_COPY_ROWS = 200;
const COUNT_TTL_MS = 5 * 60_000;
const MAX_CACHED = 200;

export type ExploreDeps = { db: Queryable; copyEnabled: boolean; sources: () => PaperSources; now?: () => number };

/* Small in-process caches: how many papers the copy holds, and recent filter counts. */
const g = globalThis as unknown as { __czExplore?: { rows: { n: number; at: number } | null; facets: Map<string, { f: ExploreFacets; at: number }> } };
const cache = (g.__czExplore ??= { rows: null, facets: new Map() });

async function copyRows(db: Queryable, now: number): Promise<number> {
  if (cache.rows && now - cache.rows.at < COUNT_TTL_MS) return cache.rows.n;
  const n = Number((await db.query<{ n: string }>(`select count(*) as n from paper_record`)).rows[0].n);
  cache.rows = { n, at: now };
  return n;
}

const useCopy = async (d: ExploreDeps) => d.copyEnabled && (await copyRows(d.db, (d.now ?? Date.now)())) >= MIN_COPY_ROWS;

/* Does a paper pass the Explore filters? (For the live listing, which can't filter itself.) */
export function passes(p: Paper, q: ExploreQuery): boolean {
  if (p.isRetracted) return false;
  if (q.subject && p.subject !== q.subject) return false;
  if (q.types.length && !q.types.includes(p.type as ExploreQuery['types'][number])) return false;
  if (q.sources.length && !q.sources.includes(p.provider)) return false;
  if (q.yearFrom != null && (p.year == null || p.year < q.yearFrom)) return false;
  if (q.yearTo != null && (p.year == null || p.year > q.yearTo)) return false;
  if (q.openAccess && !p.isOpenAccess) return false;
  if ((q.hasPdf || q.sort === 'free') && !p.pdfUrl) return false;
  if (q.hasAbstract && !p.abstract) return false;
  if (q.minCitations != null && p.citedByCount < q.minCitations) return false;
  return !(q.language && p.language && p.language !== q.language);
}

async function liveList(sources: PaperSources, q: ExploreQuery): Promise<ExploreList> {
  const source = sources.all.find((s) => s.browse);
  const empty: ExploreList = { papers: [], total: 0, page: q.page, perPage: EXPLORE_PER_PAGE, hasMore: false, sort: q.sort, from: 'live' };
  if (!source?.browse || q.page > MAX_CURSOR_PAGE) return empty;
  const order = q.sort === 'newest' ? 'newest' : 'cited';
  const r = await cursorPage(q.page, async (cursor) => {
    const page = await source.browse!({ cursor, perPage: EXPLORE_PER_PAGE, order, sinceYear: q.yearFrom });
    return { items: page.papers, total: 0, next: page.next };
  });
  const papers = r.items.filter((p) => passes(p, q));
  const hasMore = !!r.next && q.page < MAX_CURSOR_PAGE;
  return { ...empty, papers, total: (q.page - 1) * EXPLORE_PER_PAGE + papers.length + (hasMore ? EXPLORE_PER_PAGE : 0), hasMore };
}

export async function exploreList(d: ExploreDeps, q: ExploreQuery): Promise<ExploreList> {
  if (!(await useCopy(d))) return liveList(d.sources(), q);
  const { papers, total } = await exploreFeed(d.db, q, EXPLORE_PER_PAGE);
  return { papers, total, page: q.page, perPage: EXPLORE_PER_PAGE, hasMore: q.page * EXPLORE_PER_PAGE < total, sort: q.sort, from: 'copy' };
}

/* The filter counts, or null while the feed comes from the live listing. */
export async function exploreCounts(d: ExploreDeps, q: ExploreQuery): Promise<ExploreFacets | null> {
  if (!(await useCopy(d))) return null;
  const now = (d.now ?? Date.now)();
  const key = facetsKey(q);
  const hit = cache.facets.get(key);
  if (hit && now - hit.at < COUNT_TTL_MS) return hit.f;
  const f = await exploreFacets(d.db, q, now);
  cache.facets.delete(key);
  cache.facets.set(key, { f, at: now });
  while (cache.facets.size > MAX_CACHED) cache.facets.delete(cache.facets.keys().next().value as string);
  return f;
}

/* For tests: forget the caches. */
export const resetExploreCache = () => {
  cache.rows = null;
  cache.facets.clear();
};
