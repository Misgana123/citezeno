import { randomUUID } from 'node:crypto';
import type { Queryable } from '../db';
import { uniqueToNameTaken } from '../errors';
import type { Tag } from '../types';

/* Tags: free labels ("methods", "important"), with an optional color. */

const toTag = (r: { id: string; name: string; color: string | null; count: string | number }): Tag => ({ id: r.id, name: r.name, color: r.color, count: Number(r.count) });

export async function listTags(q: Queryable, userId: string): Promise<Tag[]> {
  const { rows } = await q.query(
    `select t.id, t.name, t.color, (select count(*) from shelf_item_tag x where x."tagId" = t.id) as count
     from shelf_tag t where t."userId" = $1 order by lower(t.name)`,
    [userId],
  );
  return rows.map((r) => toTag(r as never));
}

export async function createTag(q: Queryable, userId: string, name: string, color: string | null = null): Promise<Tag> {
  try {
    const { rows } = await q.query(`insert into shelf_tag (id, "userId", name, color) values ($1, $2, $3, $4) returning id, name, color, 0 as count`, [
      `t_${randomUUID()}`,
      userId,
      name,
      color,
    ]);
    return toTag(rows[0] as never);
  } catch (e) {
    return uniqueToNameTaken(e, 'tag');
  }
}

/* Tags with these names, created when missing (used when tagging by name and by imports). */
export async function findOrCreateTags(q: Queryable, userId: string, names: string[]): Promise<Tag[]> {
  // one per name ignoring case; the first spelling wins
  const byKey = new Map<string, string>();
  for (const n of names.map((x) => x.trim()).filter(Boolean)) if (!byKey.has(n.toLowerCase())) byKey.set(n.toLowerCase(), n);
  const wanted = [...byKey.values()];
  if (!wanted.length) return [];
  await q.query(
    `insert into shelf_tag (id, "userId", name)
     select 't_' || gen_random_uuid()::text, $1, n from unnest($2::text[]) as n
     on conflict ("userId", lower(name)) do nothing`,
    [userId, wanted],
  );
  const { rows } = await q.query(`select id, name, color, 0 as count from shelf_tag where "userId" = $1 and lower(name) = any($2)`, [userId, wanted.map((n) => n.toLowerCase())]);
  return rows.map((r) => toTag(r as never));
}

export async function updateTag(q: Queryable, userId: string, id: string, patch: { name?: string; color?: string | null }): Promise<boolean> {
  try {
    const { rowCount } = await q.query(
      `update shelf_tag set name = coalesce($3, name), color = case when $4::boolean then $5 else color end where "userId" = $1 and id = $2`,
      [userId, id, patch.name ?? null, patch.color !== undefined, patch.color ?? null],
    );
    return (rowCount ?? 0) > 0;
  } catch (e) {
    return uniqueToNameTaken(e, 'tag');
  }
}

export async function deleteTag(q: Queryable, userId: string, id: string): Promise<boolean> {
  const { rowCount } = await q.query(`delete from shelf_tag where "userId" = $1 and id = $2`, [userId, id]);
  return (rowCount ?? 0) > 0;
}
