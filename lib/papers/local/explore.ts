import type { ExploreFacets, FacetCount } from '../explore/types';
import { CITE_BANDS, type ExploreQuery } from '../explore/query';
import type { Paper } from '../types';
import type { Queryable } from './types';

/* The Explore feed over our own copy of papers (paper_record): one page in the
   chosen order, and how many papers each filter choice would show. No outside
   calls. Retracted papers never appear in the feed. */

/* A facet whose own filter is left out when counting it (choosing "Reviews"
   must not hide how many "Preprints" there are). */
type Facet = 'subject' | 'type' | 'source' | 'year' | 'access' | 'citations' | null;

/* The WHERE clause for a query, leaving out one facet's own filter. Values
   go in as parameters, numbered after `params`. */
function where(q: ExploreQuery, params: unknown[], except: Facet = null): string {
  const p = (v: unknown) => `$${params.push(v)}`;
  const parts = ['not "isRetracted"'];
  if (q.subject && except !== 'subject') parts.push(`subject = ${p(q.subject)}`);
  if (q.types.length && except !== 'type') parts.push(`type = any(${p(q.types)}::text[])`);
  if (q.sources.length && except !== 'source') parts.push(`provider = any(${p(q.sources)}::text[])`);
  if (except !== 'year') {
    if (q.yearFrom != null) parts.push(`year >= ${p(q.yearFrom)}`);
    if (q.yearTo != null) parts.push(`year <= ${p(q.yearTo)}`);
  }
  if (except !== 'access') {
    if (q.openAccess) parts.push('"isOpenAccess"');
    if (q.hasPdf || q.sort === 'free') parts.push('"hasPdf"');
    if (q.hasAbstract) parts.push('"hasAbstract"');
  }
  if (q.minCitations != null && except !== 'citations') parts.push(`"citedByCount" >= ${p(q.minCitations)}`);
  if (q.language) parts.push(`language = ${p(q.language)}`);
  return parts.join(' and ');
}

/* Trending: papers our users saw in the last 7 days, most seen first; then the rest, most cited first. */
const ORDER: Record<ExploreQuery['sort'], string> = {
  trending: `("seenAt" > now() - interval '7 days') desc, case when "seenAt" > now() - interval '7 days' then hits else 0 end desc, "citedByCount" desc, key`,
  cited: `"citedByCount" desc, key`,
  newest: `year desc nulls last, data->>'publicationDate' desc nulls last, key`,
  free: `"citedByCount" desc, key`,
};

export async function exploreFeed(db: Queryable, q: ExploreQuery, perPage: number): Promise<{ papers: Paper[]; total: number }> {
  const params: unknown[] = [];
  const w = where(q, params);
  const limit = `$${params.push(perPage)}`;
  const offset = `$${params.push((q.page - 1) * perPage)}`;
  const { rows } = await db.query<{ data: Paper; total: string }>(
    `select data, count(*) over() as total from paper_record where ${w} order by ${ORDER[q.sort]} limit ${limit} offset ${offset}`,
    params,
  );
  let total = Number(rows[0]?.total ?? 0);
  if (!rows.length && q.page > 1) {
    const c = [] as unknown[];
    total = Number((await db.query<{ n: string }>(`select count(*) as n from paper_record where ${where(q, c)}`, c)).rows[0].n);
  }
  return { papers: rows.map((r) => r.data), total };
}

export const FACET_YEARS = 15;
const TOP_SUBJECTS = 12;

/* Every facet's counts in one statement (one round trip, one connection). */
export async function exploreFacets(db: Queryable, q: ExploreQuery, now: number = Date.now()): Promise<ExploreFacets> {
  const params: unknown[] = [];
  const firstYear = new Date(now).getUTCFullYear() - FACET_YEARS + 1;
  const bandCounts = CITE_BANDS.map((b) => `count(*) filter (where "citedByCount" >= ${b}) as c${b}`).join(', ');
  const bandValues = CITE_BANDS.map((b) => `('${b}', x.c${b})`).join(', ');
  const sql = `
    (select 'subject' as f, subject as v, count(*) as n from paper_record where subject is not null and ${where(q, params, 'subject')} group by subject order by n desc limit ${TOP_SUBJECTS})
    union all
    select 'type', type, count(*) from paper_record where type is not null and ${where(q, params, 'type')} group by type
    union all
    select 'source', provider, count(*) from paper_record where ${where(q, params, 'source')} group by provider
    union all
    select 'year', year::text, count(*) from paper_record where year >= ${firstYear} and ${where(q, params, 'year')} group by year
    union all
    select 'access', v.k, v.n from (
      select count(*) filter (where "isOpenAccess") as oa, count(*) filter (where "hasPdf") as pdf, count(*) filter (where "hasAbstract") as abs
      from paper_record where ${where(q, params, 'access')}
    ) x cross join lateral (values ('openAccess', x.oa), ('hasPdf', x.pdf), ('hasAbstract', x.abs)) as v(k, n)
    union all
    select 'citations', b.k, b.n from (
      select ${bandCounts} from paper_record where ${where(q, params, 'citations')}
    ) x cross join lateral (values ${bandValues}) as b(k, n)
    union all
    select 'total', null, count(*) from paper_record where ${where(q, params)}`;
  const { rows } = await db.query<{ f: string; v: string | null; n: string }>(sql, params);

  const facets: ExploreFacets = { total: 0, subjects: [], types: [], sources: [], years: [], access: { openAccess: 0, hasPdf: 0, hasAbstract: 0 }, citations: [] };
  const years = new Map<string, number>();
  for (const r of rows) {
    const c: FacetCount = { value: r.v ?? '', count: Number(r.n) };
    if (r.f === 'subject') facets.subjects.push(c);
    else if (r.f === 'type') facets.types.push(c);
    else if (r.f === 'source') facets.sources.push(c);
    else if (r.f === 'year') years.set(c.value, c.count);
    else if (r.f === 'access') facets.access[c.value as keyof ExploreFacets['access']] = c.count;
    else if (r.f === 'citations') facets.citations.push(c);
    else if (r.f === 'total') facets.total = c.count;
  }
  const byCount = (a: FacetCount, b: FacetCount) => b.count - a.count || a.value.localeCompare(b.value);
  facets.types.sort(byCount);
  facets.sources.sort(byCount);
  facets.years = Array.from({ length: FACET_YEARS }, (_, i) => String(firstYear + i)).map((y) => ({ value: y, count: years.get(y) ?? 0 }));
  facets.citations.sort((a, b) => Number(a.value) - Number(b.value));
  return facets;
}
