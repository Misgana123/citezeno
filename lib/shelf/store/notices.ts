import { iso, type Queryable } from '../db';

/* In-app notices: today, papers on the shelf that were retracted after being saved. */

export type Notice = { id: string; kind: 'retracted'; itemId: string | null; title: string; createdAt: string };

/* A notice for everyone who has this paper on their shelf. */
export async function noticeRetracted(q: Queryable, paperId: string, title: string): Promise<number> {
  const { rowCount } = await q.query(
    `insert into shelf_notice (id, "userId", kind, "itemId", title)
     select 'n_' || gen_random_uuid()::text, i."userId", 'retracted', i.id, $2 from shelf_item i where i."paperId" = $1`,
    [paperId, title],
  );
  return rowCount ?? 0;
}

export async function unreadNotices(q: Queryable, userId: string): Promise<{ notices: Notice[]; unread: number }> {
  const { rows } = await q.query(`select id, kind, "itemId", title, "createdAt" from shelf_notice where "userId" = $1 and "readAt" is null order by "createdAt" desc limit 20`, [userId]);
  const count = await q.query<{ n: string }>(`select count(*) as n from shelf_notice where "userId" = $1 and "readAt" is null`, [userId]);
  return { notices: rows.map((r) => ({ ...r, createdAt: iso(r.createdAt) })) as Notice[], unread: Number(count.rows[0].n) };
}

/* Unread notices on the shelf of the lab the user is a member of (guests: none; 0 outside a lab). */
export async function labUnreadNotices(q: Queryable, userId: string): Promise<number> {
  const { rows } = await q.query<{ n: string }>(
    `select count(*) as n from shelf_notice n join lab l on l."shelfUserId" = n."userId" join lab_member m on m."labId" = l.id
     where m."userId" = $1 and m.role <> 'guest' and n."readAt" is null`,
    [userId],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function markNoticesRead(q: Queryable, userId: string, ids?: string[]): Promise<number> {
  const { rowCount } = ids?.length
    ? await q.query(`update shelf_notice set "readAt" = now() where "userId" = $1 and id = any($2) and "readAt" is null`, [userId, ids])
    : await q.query(`update shelf_notice set "readAt" = now() where "userId" = $1 and "readAt" is null`, [userId]);
  return rowCount ?? 0;
}
