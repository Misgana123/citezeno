import type { Queryable } from '../db';
import { buildListQuery, type ListQuery } from './list-query';

/* Counts over the user's saved papers (all of them, or those the list
   filters pick): by year, journal, author, topic, type and reading status,
   plus the words their titles use most. The same filters as /shelf. */

export type Count = { name: string; count: number };
export type ShelfStats = {
  total: number;
  openAccess: number;
  retracted: number;
  withPdf: number;
  /* every year that has papers, oldest first; papers without one are left out */
  byYear: { year: number; count: number }[];
  noYear: number;
  journals: Count[];
  authors: Count[];
  topics: Count[];
  types: Count[];
  status: Count[];
  titleWords: Count[];
};

const TOP_DEFAULT = 10;
const TITLES_MAX = 5000;
const STOP = new Set(
  'a an and are as at based be between by can do does for from has have how in into is it its new of on or our over than that the their them these this through to toward towards under using via vs was we were what when which while who why will with within without study studies analysis approach paper review evidence effect effects case among across'.split(
    ' ',
  ),
);

/* The words titles use most, ignoring short and common words. */
export function topWords(titles: string[], top: number): Count[] {
  const n = new Map<string, number>();
  for (const t of titles) {
    // each title counts a word once
    const words = new Set(t.normalize('NFKC').toLowerCase().match(/[\p{L}][\p{L}\p{N}-]+/gu) ?? []);
    for (const w of words) if (w.length > 2 && !STOP.has(w)) n.set(w, (n.get(w) ?? 0) + 1);
  }
  return [...n.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, top)
    .map(([name, count]) => ({ name, count }));
}

export async function shelfStats(q: Queryable, userId: string, query: ListQuery, top = TOP_DEFAULT): Promise<ShelfStats> {
  const { where, values } = buildListQuery(userId, query);
  const picked = `select i.id, i."readingStatus", p.year, p."isOpenAccess", p."isRetracted", p.title, p.data from shelf_item i join shelf_paper p on p.id = i."paperId" where ${where}`;
  const limit = `$${values.length + 1}`;
  const counted = (expr: string, from = 'picked') =>
    q.query<{ name: string; count: string }>(`with picked as (${picked}) select ${expr} as name, count(*) as count from ${from} group by 1 having ${expr} is not null and ${expr} <> '' order by 2 desc, 1 limit ${limit}`, [...values, top]);

  const [totals, years, journals, authors, topics, types, status, titles] = await Promise.all([
    q.query<{ total: string; oa: string; retracted: string; pdf: string; noyear: string }>(
      `with picked as (${picked}) select count(*) as total, count(*) filter (where "isOpenAccess") as oa, count(*) filter (where "isRetracted") as retracted,
         count(*) filter (where exists (select 1 from shelf_pdf f where f."itemId" = picked.id and f.status = 'ready')) as pdf, count(*) filter (where year is null) as noyear from picked`,
      values,
    ),
    q.query<{ year: number; count: string }>(`with picked as (${picked}) select year, count(*) as count from picked where year is not null group by year order by year`, values),
    counted(`data->>'source'`),
    counted(`author->>'name'`, `picked, jsonb_array_elements(case when jsonb_typeof(data->'authors') = 'array' then data->'authors' else '[]'::jsonb end) as a(author)`),
    counted(`topic`, `picked, jsonb_array_elements_text(case when jsonb_typeof(data->'topics') = 'array' then data->'topics' else '[]'::jsonb end) as t(topic)`),
    counted(`data->>'type'`),
    counted(`"readingStatus"`),
    q.query<{ title: string }>(`with picked as (${picked}) select title from picked limit ${limit}`, [...values, TITLES_MAX]),
  ]);
  const t = totals.rows[0];
  const list = (r: { rows: { name: string; count: string }[] }) => r.rows.map((x) => ({ name: x.name, count: Number(x.count) }));
  return {
    total: Number(t.total),
    openAccess: Number(t.oa),
    retracted: Number(t.retracted),
    withPdf: Number(t.pdf),
    byYear: years.rows.map((r) => ({ year: r.year, count: Number(r.count) })),
    noYear: Number(t.noyear),
    journals: list(journals),
    authors: list(authors),
    topics: list(topics),
    types: list(types),
    status: list(status),
    titleWords: topWords(
      titles.rows.map((r) => r.title),
      top,
    ),
  };
}
