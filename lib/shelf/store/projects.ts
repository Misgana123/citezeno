import { randomUUID } from 'node:crypto';
import { iso, type Queryable } from '../db';
import { uniqueToNameTaken } from '../errors';
import type { Project } from '../types';

/* Projects: a user's top-level groups ("Thesis", "Climate essay"). */

const toProject = (r: { id: string; name: string; createdAt: Date; count: string | number }): Project => ({
  id: r.id,
  name: r.name,
  createdAt: iso(r.createdAt) as string,
  count: Number(r.count),
});

export async function listProjects(q: Queryable, userId: string): Promise<Project[]> {
  const { rows } = await q.query(
    `select pr.id, pr.name, pr."createdAt", (select count(*) from shelf_item_project ip where ip."projectId" = pr.id) as count
     from shelf_project pr where pr."userId" = $1 order by lower(pr.name)`,
    [userId],
  );
  return rows.map((r) => toProject(r as never));
}

export async function createProject(q: Queryable, userId: string, name: string): Promise<Project> {
  try {
    const { rows } = await q.query(`insert into shelf_project (id, "userId", name) values ($1, $2, $3) returning id, name, "createdAt", 0 as count`, [
      `pr_${randomUUID()}`,
      userId,
      name,
    ]);
    return toProject(rows[0] as never);
  } catch (e) {
    return uniqueToNameTaken(e, 'project');
  }
}

/* The project with this name, created if missing (used by imports and "save into"). */
export async function findOrCreateProject(q: Queryable, userId: string, name: string): Promise<Project> {
  const { rows } = await q.query(`select id, name, "createdAt", 0 as count from shelf_project where "userId" = $1 and lower(name) = lower($2)`, [userId, name]);
  return rows[0] ? toProject(rows[0] as never) : createProject(q, userId, name);
}

export async function renameProject(q: Queryable, userId: string, id: string, name: string): Promise<boolean> {
  try {
    const { rowCount } = await q.query(`update shelf_project set name = $3 where "userId" = $1 and id = $2`, [userId, id, name]);
    return (rowCount ?? 0) > 0;
  } catch (e) {
    return uniqueToNameTaken(e, 'project');
  }
}

/* Deleting a project removes its folders and memberships, never the papers. */
export async function deleteProject(q: Queryable, userId: string, id: string): Promise<boolean> {
  const { rowCount } = await q.query(`delete from shelf_project where "userId" = $1 and id = $2`, [userId, id]);
  return (rowCount ?? 0) > 0;
}

export async function ownsProject(q: Queryable, userId: string, id: string): Promise<boolean> {
  const { rowCount } = await q.query(`select 1 from shelf_project where "userId" = $1 and id = $2`, [userId, id]);
  return (rowCount ?? 0) > 0;
}
