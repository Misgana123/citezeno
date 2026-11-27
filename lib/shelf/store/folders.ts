import { randomUUID } from 'node:crypto';
import { iso, type Queryable } from '../db';
import { ShelfError, uniqueToNameTaken } from '../errors';
import type { Folder } from '../types';

/* Folders: optional subgroups inside one project. */

const toFolder = (r: { id: string; projectId: string; name: string; createdAt: Date; count: string | number }): Folder => ({
  id: r.id,
  projectId: r.projectId,
  name: r.name,
  createdAt: iso(r.createdAt) as string,
  count: Number(r.count),
});

export async function listFolders(q: Queryable, userId: string): Promise<Folder[]> {
  const { rows } = await q.query(
    `select f.id, f."projectId", f.name, f."createdAt", (select count(*) from shelf_item_folder x where x."folderId" = f.id) as count
     from shelf_folder f where f."userId" = $1 order by lower(f.name)`,
    [userId],
  );
  return rows.map((r) => toFolder(r as never));
}

/* A folder in one of the user's own projects. */
export async function createFolder(q: Queryable, userId: string, projectId: string, name: string): Promise<Folder> {
  try {
    const { rows } = await q.query(
      `insert into shelf_folder (id, "userId", "projectId", name)
       select $1, $2, pr.id, $4 from shelf_project pr where pr.id = $3 and pr."userId" = $2
       returning id, "projectId", name, "createdAt", 0 as count`,
      [`fo_${randomUUID()}`, userId, projectId, name],
    );
    if (!rows[0]) throw new ShelfError('not_found', 'That project no longer exists.');
    return toFolder(rows[0] as never);
  } catch (e) {
    return uniqueToNameTaken(e, 'folder in this project');
  }
}

export async function renameFolder(q: Queryable, userId: string, id: string, name: string): Promise<boolean> {
  try {
    const { rowCount } = await q.query(`update shelf_folder set name = $3 where "userId" = $1 and id = $2`, [userId, id, name]);
    return (rowCount ?? 0) > 0;
  } catch (e) {
    return uniqueToNameTaken(e, 'folder in this project');
  }
}

/* Deleting a folder keeps the papers in its project. */
export async function deleteFolder(q: Queryable, userId: string, id: string): Promise<boolean> {
  const { rowCount } = await q.query(`delete from shelf_folder where "userId" = $1 and id = $2`, [userId, id]);
  return (rowCount ?? 0) > 0;
}
