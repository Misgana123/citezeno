import type { Queryable } from '../db';

/* Which projects, folders and tags each item is in. Every statement joins the
   items and the group to the same user, so nothing can link one user's item to
   another user's project, folder or tag. A folder lives in a project, so an
   item in a folder is always in that folder's project too. */

export async function addToProject(q: Queryable, userId: string, itemIds: string[], projectId: string): Promise<number> {
  if (!itemIds.length) return 0;
  const { rowCount } = await q.query(
    `insert into shelf_item_project ("itemId", "projectId")
     select i.id, pr.id from shelf_item i join shelf_project pr on pr.id = $3 and pr."userId" = $1
     where i."userId" = $1 and i.id = any($2)
     on conflict do nothing`,
    [userId, itemIds, projectId],
  );
  return rowCount ?? 0;
}

/* Out of a project, and so out of its folders too. */
export async function removeFromProject(q: Queryable, userId: string, itemIds: string[], projectId: string): Promise<number> {
  if (!itemIds.length) return 0;
  await q.query(
    `delete from shelf_item_folder x using shelf_folder f, shelf_item i
     where x."folderId" = f.id and f."projectId" = $3 and f."userId" = $1 and x."itemId" = i.id and i."userId" = $1 and i.id = any($2)`,
    [userId, itemIds, projectId],
  );
  const { rowCount } = await q.query(
    `delete from shelf_item_project x using shelf_item i
     where x."itemId" = i.id and i."userId" = $1 and i.id = any($2) and x."projectId" = $3`,
    [userId, itemIds, projectId],
  );
  return rowCount ?? 0;
}

/* Into a folder, and into its project. */
export async function addToFolder(q: Queryable, userId: string, itemIds: string[], folderId: string): Promise<number> {
  if (!itemIds.length) return 0;
  await q.query(
    `insert into shelf_item_project ("itemId", "projectId")
     select i.id, f."projectId" from shelf_item i join shelf_folder f on f.id = $3 and f."userId" = $1
     where i."userId" = $1 and i.id = any($2)
     on conflict do nothing`,
    [userId, itemIds, folderId],
  );
  const { rowCount } = await q.query(
    `insert into shelf_item_folder ("itemId", "folderId")
     select i.id, f.id from shelf_item i join shelf_folder f on f.id = $3 and f."userId" = $1
     where i."userId" = $1 and i.id = any($2)
     on conflict do nothing`,
    [userId, itemIds, folderId],
  );
  return rowCount ?? 0;
}

/* Out of a folder; the items stay in its project. */
export async function removeFromFolder(q: Queryable, userId: string, itemIds: string[], folderId: string): Promise<number> {
  if (!itemIds.length) return 0;
  const { rowCount } = await q.query(
    `delete from shelf_item_folder x using shelf_item i
     where x."itemId" = i.id and i."userId" = $1 and i.id = any($2) and x."folderId" = $3`,
    [userId, itemIds, folderId],
  );
  return rowCount ?? 0;
}

/* Move: out of every project and folder, then into the target (none = Unsorted). */
export async function moveItems(q: Queryable, userId: string, itemIds: string[], target: { projectId?: string | null; folderId?: string | null }): Promise<void> {
  if (!itemIds.length) return;
  await q.query(`delete from shelf_item_folder x using shelf_item i where x."itemId" = i.id and i."userId" = $1 and i.id = any($2)`, [userId, itemIds]);
  await q.query(`delete from shelf_item_project x using shelf_item i where x."itemId" = i.id and i."userId" = $1 and i.id = any($2)`, [userId, itemIds]);
  if (target.folderId) await addToFolder(q, userId, itemIds, target.folderId);
  else if (target.projectId) await addToProject(q, userId, itemIds, target.projectId);
}

export async function addTags(q: Queryable, userId: string, itemIds: string[], tagIds: string[]): Promise<number> {
  if (!itemIds.length || !tagIds.length) return 0;
  const { rowCount } = await q.query(
    `insert into shelf_item_tag ("itemId", "tagId")
     select i.id, t.id from shelf_item i join shelf_tag t on t."userId" = $1 and t.id = any($3)
     where i."userId" = $1 and i.id = any($2)
     on conflict do nothing`,
    [userId, itemIds, tagIds],
  );
  return rowCount ?? 0;
}

export async function removeTags(q: Queryable, userId: string, itemIds: string[], tagIds: string[]): Promise<number> {
  if (!itemIds.length || !tagIds.length) return 0;
  const { rowCount } = await q.query(
    `delete from shelf_item_tag x using shelf_item i
     where x."itemId" = i.id and i."userId" = $1 and i.id = any($2) and x."tagId" = any($3)`,
    [userId, itemIds, tagIds],
  );
  return rowCount ?? 0;
}
