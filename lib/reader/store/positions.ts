import { iso, type Queryable } from '@/lib/shelf/db';

/* Where each user stopped reading each paper. Private to the user. */

export type ReadingPosition = { paperId: string; page: number; pageCount: number | null; title: string; updatedAt: string };

const toPos = (r: Record<string, unknown>): ReadingPosition => ({
  paperId: r.paperId as string,
  page: r.page as number,
  pageCount: (r.pageCount as number | null) ?? null,
  title: r.title as string,
  updatedAt: iso(r.updatedAt as Date)!,
});

export async function getPosition(q: Queryable, userId: string, paperId: string): Promise<ReadingPosition | null> {
  const { rows } = await q.query(`select "paperId", page, "pageCount", title, "updatedAt" from reader_position where "userId" = $1 and "paperId" = $2`, [userId, paperId]);
  return rows[0] ? toPos(rows[0]) : null;
}

/* Opened: remembered for "Continue reading" (the page stays where it was). */
export async function touchPosition(q: Queryable, userId: string, paperId: string, title: string): Promise<void> {
  await q.query(
    `insert into reader_position ("userId", "paperId", title) values ($1, $2, $3)
     on conflict ("userId", "paperId") do update set title = excluded.title, "updatedAt" = now()`,
    [userId, paperId, title.slice(0, 500)],
  );
}

export async function savePosition(q: Queryable, userId: string, paperId: string, page: number, pageCount: number | null): Promise<void> {
  await q.query(
    `insert into reader_position ("userId", "paperId", page, "pageCount") values ($1, $2, $3, $4)
     on conflict ("userId", "paperId") do update set page = excluded.page, "pageCount" = coalesce(excluded."pageCount", reader_position."pageCount"), "updatedAt" = now()`,
    [userId, paperId, page, pageCount],
  );
}

export async function recentPositions(q: Queryable, userId: string, limit = 6): Promise<ReadingPosition[]> {
  const { rows } = await q.query(`select "paperId", page, "pageCount", title, "updatedAt" from reader_position where "userId" = $1 and title <> '' order by "updatedAt" desc limit $2`, [userId, limit]);
  return rows.map(toPos);
}
