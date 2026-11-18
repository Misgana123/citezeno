import { randomUUID } from 'node:crypto';
import { iso, type Queryable } from '../db';
import type { AddedVia, ReadingStatus, ShelfItem } from '../types';
import { buildListQuery, type ListQuery } from './list-query';
import { deleteOrphanedPrivate, PAPER_COLUMNS, paperFromPrefixed } from './papers';

/* Shelf items (shelf_item): one paper in one user's shelf. Every function takes
   the signed-in user's ID and only ever reads or changes that user's rows. */

export const ITEM_SELECT = `
  select i.id, i."addedAt", i."addedVia", i."readingStatus", i.note, ${PAPER_COLUMNS},
    array(select "projectId" from shelf_item_project where "itemId" = i.id order by "projectId") as "projectIds",
    array(select "folderId" from shelf_item_folder where "itemId" = i.id order by "folderId") as "folderIds",
    array(select "tagId" from shelf_item_tag where "itemId" = i.id order by "tagId") as "tagIds"
  from shelf_item i join shelf_paper p on p.id = i."paperId"`;

export function toItem(r: Record<string, unknown>): ShelfItem {
  return {
    id: r.id as string,
    paper: paperFromPrefixed(r),
    addedAt: iso(r.addedAt as Date) as string,
    addedVia: r.addedVia as AddedVia,
    readingStatus: r.readingStatus as ReadingStatus,
    note: (r.note as string | null) ?? null,
    projectIds: (r.projectIds as string[]) ?? [],
    folderIds: (r.folderIds as string[]) ?? [],
    tagIds: (r.tagIds as string[]) ?? [],
  };
}

export async function getItem(q: Queryable, userId: string, id: string): Promise<ShelfItem | null> {
  const { rows } = await q.query(`${ITEM_SELECT} where i."userId" = $1 and i.id = $2`, [userId, id]);
  return rows[0] ? toItem(rows[0]) : null;
}

export async function getItemByPaper(q: Queryable, userId: string, paperId: string): Promise<ShelfItem | null> {
  const { rows } = await q.query(`${ITEM_SELECT} where i."userId" = $1 and i."paperId" = $2`, [userId, paperId]);
  return rows[0] ? toItem(rows[0]) : null;
}

/* Put a paper on the user's shelf. When it is already there nothing changes
   and the existing item comes back with created: false. */
export async function addItem(q: Queryable, userId: string, paperId: string, addedVia: AddedVia): Promise<{ item: ShelfItem; created: boolean }> {
  const { rows } = await q.query<{ id: string }>(
    `insert into shelf_item (id, "userId", "paperId", "addedVia") values ($1, $2, $3, $4)
     on conflict ("userId", "paperId") do nothing returning id`,
    [`i_${randomUUID()}`, userId, paperId, addedVia],
  );
  const item = rows[0] ? await getItem(q, userId, rows[0].id) : await getItemByPaper(q, userId, paperId);
  if (!item) throw new Error('Shelf item vanished while saving.');
  return { item, created: rows.length > 0 };
}

export type ItemPatch = { note?: string | null; readingStatus?: ReadingStatus };

export async function updateItem(q: Queryable, userId: string, id: string, patch: ItemPatch): Promise<ShelfItem | null> {
  const sets: string[] = [];
  const values: unknown[] = [userId, id];
  if (patch.note !== undefined) {
    values.push(patch.note?.trim() ? patch.note : null);
    sets.push(`note = $${values.length}`);
  }
  if (patch.readingStatus !== undefined) {
    values.push(patch.readingStatus);
    sets.push(`"readingStatus" = $${values.length}`);
  }
  if (sets.length) {
    const { rowCount } = await q.query(`update shelf_item set ${sets.join(', ')}, "updatedAt" = now() where "userId" = $1 and id = $2`, values);
    if (!rowCount) return null;
  }
  return getItem(q, userId, id);
}

/* Set the reading status of several items at once; returns how many changed. */
export async function setStatus(q: Queryable, userId: string, ids: string[], status: ReadingStatus): Promise<number> {
  if (!ids.length) return 0;
  const { rowCount } = await q.query(`update shelf_item set "readingStatus" = $3, "updatedAt" = now() where "userId" = $1 and id = any($2)`, [userId, ids, status]);
  return rowCount ?? 0;
}

/* Remove items from the shelf. Shared paper records stay; private ones left unused go. */
export async function deleteItems(q: Queryable, userId: string, ids: string[]): Promise<{ deleted: string[] }> {
  if (!ids.length) return { deleted: [] };
  const { rows } = await q.query<{ id: string; paperId: string }>(`delete from shelf_item where "userId" = $1 and id = any($2) returning id, "paperId"`, [userId, ids]);
  await deleteOrphanedPrivate(q, rows.map((r) => r.paperId));
  return { deleted: rows.map((r) => r.id) };
}

/* Which of these OpenAlex papers the user has saved: { W123: itemId }. */
export async function savedMap(q: Queryable, userId: string, openalexIds: string[]): Promise<Record<string, string>> {
  if (!openalexIds.length) return {};
  const { rows } = await q.query<{ paperId: string; id: string }>(`select "paperId", id from shelf_item where "userId" = $1 and "paperId" = any($2)`, [userId, openalexIds]);
  return Object.fromEntries(rows.map((r) => [r.paperId, r.id]));
}

/* Items the user owns among these IDs (for checking bulk requests). */
export async function ownedItemIds(q: Queryable, userId: string, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const { rows } = await q.query<{ id: string }>(`select id from shelf_item where "userId" = $1 and id = any($2)`, [userId, ids]);
  return rows.map((r) => r.id);
}

export type ItemPage = { items: ShelfItem[]; total: number; page: number; perPage: number };

export async function listItems(q: Queryable, userId: string, query: ListQuery): Promise<ItemPage> {
  const built = buildListQuery(userId, query);
  const [{ rows }, count] = await Promise.all([
    q.query(`${ITEM_SELECT} where ${built.where} order by ${built.orderBy} limit ${built.limit} offset ${built.offset}`, built.values),
    q.query<{ n: string }>(`select count(*) as n from shelf_item i join shelf_paper p on p.id = i."paperId" where ${built.where}`, built.values),
  ]);
  return { items: rows.map(toItem), total: Number(count.rows[0].n), page: query.page, perPage: query.perPage };
}
