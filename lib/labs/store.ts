import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { iso, type Queryable } from '@/lib/shelf/db';
import type { Lab, LabInvite, LabMember, LabRole, Membership } from './types';

/* The lab tables (schema.ts): labs, members, invitations, project access. */

type LabRow = { id: string; name: string; ownerId: string; shelfUserId: string; createdAt: Date };
const LAB_COLS = `l.id, l.name, l."ownerId", l."shelfUserId", l."createdAt"`;
const toLab = (r: LabRow): Lab => ({ id: r.id, name: r.name, ownerId: r.ownerId, shelfUserId: r.shelfUserId, createdAt: iso(r.createdAt)! });

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(24).toString('base64url');

/* The lab someone belongs to as owner, admin or member (one at most). */
export async function membershipOf(q: Queryable, userId: string): Promise<Membership | null> {
  const { rows } = await q.query<LabRow & { role: LabRole; creditCap: number | null }>(
    `select ${LAB_COLS}, m.role, m."creditCap" from lab_member m join lab l on l.id = m."labId" where m."userId" = $1 and m.role <> 'guest'`,
    [userId],
  );
  return rows[0] ? { lab: toLab(rows[0]), role: rows[0].role, creditCap: rows[0].creditCap } : null;
}

/* Someone's place in one lab (guests included). */
export async function memberIn(q: Queryable, labId: string, userId: string): Promise<Membership | null> {
  const { rows } = await q.query<LabRow & { role: LabRole; creditCap: number | null }>(
    `select ${LAB_COLS}, m.role, m."creditCap" from lab_member m join lab l on l.id = m."labId" where m."labId" = $1 and m."userId" = $2`,
    [labId, userId],
  );
  return rows[0] ? { lab: toLab(rows[0]), role: rows[0].role, creditCap: rows[0].creditCap } : null;
}

export async function getLab(q: Queryable, labId: string): Promise<Lab | null> {
  const { rows } = await q.query<LabRow>(`select ${LAB_COLS} from lab l where l.id = $1`, [labId]);
  return rows[0] ? toLab(rows[0]) : null;
}

/* The labs where someone is a guest. */
export async function guestLabs(q: Queryable, userId: string): Promise<{ id: string; name: string }[]> {
  const { rows } = await q.query<{ id: string; name: string }>(`select l.id, l.name from lab_member m join lab l on l.id = m."labId" where m."userId" = $1 and m.role = 'guest' order by l.name`, [userId]);
  return rows;
}

/* A new lab, with its own shelf account (a user row nobody can sign in with) and its owner. */
export async function insertLab(q: Queryable, ownerId: string, name: string): Promise<Lab> {
  const id = `lab_${randomUUID()}`;
  const shelfUserId = `labshelf_${randomUUID()}`;
  await q.query(`insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values ($1, $2, $3, false, now(), now())`, [shelfUserId, `${name} (lab shelf)`, `${shelfUserId}@labs.citezeno.invalid`]);
  const { rows } = await q.query<LabRow>(`insert into lab (id, name, "ownerId", "shelfUserId") values ($1, $2, $3, $4) returning id, name, "ownerId", "shelfUserId", "createdAt"`, [id, name, ownerId, shelfUserId]);
  await q.query(`insert into lab_member ("labId", "userId", role) values ($1, $2, 'owner')`, [id, ownerId]);
  return toLab(rows[0]);
}

export async function renameLab(q: Queryable, labId: string, name: string): Promise<void> {
  await q.query(`update lab set name = $2 where id = $1`, [labId, name]);
}

/* Deleting the lab's shelf account deletes the lab, its members, invitations and shelf. */
export async function deleteLab(q: Queryable, lab: Lab): Promise<void> {
  await q.query(`delete from "user" where id = $1`, [lab.shelfUserId]);
}

type MemberRow = { userId: string; name: string | null; email: string | null; image?: string | null; role: LabRole; creditCap: number | null; joinedAt: Date };

export async function listMembers(q: Queryable, labId: string): Promise<LabMember[]> {
  const { rows } = await q.query<MemberRow>(
    `select m."userId", u.name, u.email, m.role, m."creditCap", m."joinedAt" from lab_member m join "user" u on u.id = m."userId" where m."labId" = $1
     order by array_position(array['owner','admin','member','guest'], m.role), lower(coalesce(u.name, u.email, ''))`,
    [labId],
  );
  return rows.map((r) => ({ userId: r.userId, name: r.name || r.email || 'Someone', email: r.email ?? '', image: r.image ?? null, role: r.role, creditCap: r.creditCap, joinedAt: iso(r.joinedAt)! }));
}

/* People in the lab besides the owner and guests, and email invitations still open for them. */
export async function seatsTaken(q: Queryable, labId: string, now: Date): Promise<number> {
  const { rows } = await q.query<{ n: string }>(
    `select (select count(*) from lab_member where "labId" = $1 and role in ('admin', 'member'))
          + (select count(*) from lab_invite where "labId" = $1 and email is not null and role in ('admin', 'member') and "usedAt" is null and ("expiresAt" is null or "expiresAt" > $2)) as n`,
    [labId, now],
  );
  return Number(rows[0].n);
}

export async function addMember(q: Queryable, labId: string, userId: string, role: LabRole): Promise<void> {
  // a guest who is now invited as a member is upgraded
  await q.query(`insert into lab_member ("labId", "userId", role) values ($1, $2, $3) on conflict ("labId", "userId") do update set role = excluded.role where lab_member.role = 'guest'`, [labId, userId, role]);
}

export async function setRole(q: Queryable, labId: string, userId: string, role: LabRole): Promise<void> {
  await q.query(`update lab_member set role = $3 where "labId" = $1 and "userId" = $2`, [labId, userId, role]);
}

export async function setCap(q: Queryable, labId: string, userId: string, cap: number | null): Promise<void> {
  await q.query(`update lab_member set "creditCap" = $3 where "labId" = $1 and "userId" = $2`, [labId, userId, cap]);
}

export async function removeMember(q: Queryable, labId: string, userId: string): Promise<boolean> {
  await q.query(`delete from lab_project_access where "labId" = $1 and "userId" = $2`, [labId, userId]);
  const { rowCount } = await q.query(`delete from lab_member where "labId" = $1 and "userId" = $2 and role <> 'owner'`, [labId, userId]);
  return (rowCount ?? 0) > 0;
}

export async function setOwner(q: Queryable, labId: string, from: string, to: string): Promise<void> {
  await q.query(`update lab set "ownerId" = $2 where id = $1`, [labId, to]);
  await q.query(`update lab_member set role = 'admin' where "labId" = $1 and "userId" = $2`, [labId, from]);
  await q.query(`update lab_member set role = 'owner' where "labId" = $1 and "userId" = $2`, [labId, to]);
}

/* ---------- invitations ---------- */

type InviteRow = { id: string; labId: string; email: string | null; role: Exclude<LabRole, 'owner'>; projectId: string | null; access: 'view' | 'edit' | null; token: string | null; createdBy: string | null; createdAt: Date; expiresAt: Date | null; usedAt: Date | null };
const INVITE_COLS = `id, "labId", email, role, "projectId", access, token, "createdBy", "createdAt", "expiresAt", "usedAt"`;
const toInvite = (r: InviteRow): LabInvite => ({ id: r.id, kind: r.email ? 'email' : 'link', email: r.email, role: r.role, projectId: r.projectId, access: r.access, createdAt: iso(r.createdAt)!, expiresAt: iso(r.expiresAt) });

export async function insertInvite(q: Queryable, i: { labId: string; email: string | null; role: Exclude<LabRole, 'owner'>; projectId?: string | null; access?: 'view' | 'edit' | null; createdBy: string; expiresAt: Date | null; keepToken: boolean }): Promise<{ invite: LabInvite; token: string }> {
  const token = newToken();
  const { rows } = await q.query<InviteRow>(
    `insert into lab_invite (id, "labId", email, role, "projectId", access, "tokenHash", token, "createdBy", "expiresAt") values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning ${INVITE_COLS}`,
    [`inv_${randomUUID()}`, i.labId, i.email, i.role, i.projectId ?? null, i.access ?? null, hashToken(token), i.keepToken ? token : null, i.createdBy, i.expiresAt],
  );
  return { invite: toInvite(rows[0]), token };
}

/* Open invitations: email ones not used or expired. */
export async function listInvites(q: Queryable, labId: string, now: Date): Promise<LabInvite[]> {
  const { rows } = await q.query<InviteRow>(`select ${INVITE_COLS} from lab_invite where "labId" = $1 and email is not null and "usedAt" is null and ("expiresAt" is null or "expiresAt" > $2) order by "createdAt" desc`, [labId, now]);
  return rows.map(toInvite);
}

export async function shareLink(q: Queryable, labId: string): Promise<string | null> {
  const { rows } = await q.query<{ token: string | null }>(`select token from lab_invite where "labId" = $1 and email is null order by "createdAt" desc limit 1`, [labId]);
  return rows[0]?.token ?? null;
}

export async function deleteShareLinks(q: Queryable, labId: string): Promise<void> {
  await q.query(`delete from lab_invite where "labId" = $1 and email is null`, [labId]);
}

export async function deleteInvite(q: Queryable, labId: string, id: string): Promise<boolean> {
  const { rowCount } = await q.query(`delete from lab_invite where "labId" = $1 and id = $2`, [labId, id]);
  return (rowCount ?? 0) > 0;
}

export async function inviteByToken(q: Queryable, token: string): Promise<(LabInvite & { labId: string; createdBy: string | null; usedAt: string | null }) | null> {
  const { rows } = await q.query<InviteRow>(`select ${INVITE_COLS} from lab_invite where "tokenHash" = $1`, [hashToken(token)]);
  const r = rows[0];
  return r ? { ...toInvite(r), labId: r.labId, createdBy: r.createdBy, usedAt: iso(r.usedAt) } : null;
}

export async function markInviteUsed(q: Queryable, id: string): Promise<void> {
  await q.query(`update lab_invite set "usedAt" = now() where id = $1 and email is not null`, [id]);
}

/* ---------- project access (guests) ---------- */

export async function grantProject(q: Queryable, labId: string, projectId: string, userId: string, access: 'view' | 'edit'): Promise<void> {
  await q.query(`insert into lab_project_access ("labId", "projectId", "userId", access) values ($1, $2, $3, $4) on conflict ("projectId", "userId") do update set access = excluded.access`, [labId, projectId, userId, access]);
}

export async function revokeProject(q: Queryable, projectId: string, userId: string): Promise<void> {
  await q.query(`delete from lab_project_access where "projectId" = $1 and "userId" = $2`, [projectId, userId]);
}

/* The lab projects a guest may open, and how. */
export async function projectAccess(q: Queryable, labId: string, userId: string): Promise<Map<string, 'view' | 'edit'>> {
  const { rows } = await q.query<{ projectId: string; access: 'view' | 'edit' }>(`select "projectId", access from lab_project_access where "labId" = $1 and "userId" = $2`, [labId, userId]);
  return new Map(rows.map((r) => [r.projectId, r.access]));
}

/* Everyone with access to one lab project (the guests and limited members). */
export async function projectPeople(q: Queryable, projectId: string): Promise<{ userId: string; name: string; email: string; access: 'view' | 'edit' }[]> {
  const { rows } = await q.query<{ userId: string; name: string | null; email: string | null; access: 'view' | 'edit' }>(
    `select a."userId", u.name, u.email, a.access from lab_project_access a join "user" u on u.id = a."userId" where a."projectId" = $1 order by lower(coalesce(u.name, u.email, ''))`,
    [projectId],
  );
  return rows.map((r) => ({ userId: r.userId, name: r.name || r.email || 'Someone', email: r.email ?? '', access: r.access }));
}
