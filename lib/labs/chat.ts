import type { Limits } from '@/lib/plans';
import type { Queryable } from '@/lib/shelf/db';
import { memberIn, membershipOf } from './store';
import type { Lab, LabRole } from './types';

/* Chats inside lab projects: whether a project is a lab's (and the user may
   write there), and who pays for a reply. Work in a lab project is paid from
   the lab owner's credits, up to each member's monthly cap; past it, and for
   guests, the person's own credits pay. */

export type LabProject = { lab: Lab; role: LabRole; canEdit: boolean };

/* A lab project the user can reach: their lab's (members edit), or one shared with them as a guest. */
export async function labProjectFor(q: Queryable, userId: string, projectId: string): Promise<LabProject | null> {
  const mine = await membershipOf(q, userId);
  if (mine) {
    const { rowCount } = await q.query(`select 1 from shelf_project where id = $1 and "userId" = $2`, [projectId, mine.lab.shelfUserId]);
    if (rowCount) return { lab: mine.lab, role: mine.role, canEdit: true };
  }
  const { rows } = await q.query<{ labId: string; access: 'view' | 'edit' }>(`select "labId", access from lab_project_access where "projectId" = $1 and "userId" = $2`, [projectId, userId]);
  if (!rows[0]) return null;
  const m = await memberIn(q, rows[0].labId, userId);
  return m ? { lab: m.lab, role: m.role, canEdit: rows[0].access === 'edit' } : null;
}

/* Lab credits a member has spent this calendar month (UTC). */
export async function labSpend(q: Queryable, lab: Pick<Lab, 'id' | 'ownerId'>, memberId: string, now = new Date()): Promise<number> {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const { rows } = await q.query<{ n: string | null }>(
    `select sum(greatest(charged, held)) as n from credit_action where "userId" = $1 and meta->>'labId' = $2 and meta->>'memberId' = $3 and "createdAt" >= $4`,
    [lab.ownerId, lab.id, memberId, since],
  );
  return Number(rows[0]?.n ?? 0);
}

/* Each member's lab credits this month, for the owner and admins. */
export async function labSpendByMember(q: Queryable, lab: Pick<Lab, 'id' | 'ownerId'>, now = new Date()): Promise<Map<string, number>> {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const { rows } = await q.query<{ memberId: string; n: string }>(
    `select meta->>'memberId' as "memberId", sum(greatest(charged, held)) as n from credit_action where "userId" = $1 and meta->>'labId' = $2 and "createdAt" >= $3 group by 1`,
    [lab.ownerId, lab.id, since],
  );
  return new Map(rows.map((r) => [r.memberId, Number(r.n)]));
}

export type LabChat = { lab: Lab; role: LabRole; canPost: boolean; payer: string; overCap: boolean };

/* For a reply in a lab chat: can this user write, and whose credits pay. */
export async function labChatFor(d: { db: Queryable; limitsOf(userId: string): Promise<Limits> }, userId: string, conv: { labId: string | null; projectId: string | null }): Promise<LabChat | null> {
  if (!conv.labId) return null;
  const m = await memberIn(d.db, conv.labId, userId);
  if (!m) return null;
  let canPost = m.role !== 'guest';
  if (!canPost && conv.projectId) {
    const { rows } = await d.db.query<{ access: string }>(`select access from lab_project_access where "projectId" = $1 and "userId" = $2`, [conv.projectId, userId]);
    canPost = rows[0]?.access === 'edit';
  }
  // guests, and a lab whose owner left the Lab plan, pay with their own credits
  if (m.role === 'guest' || (await d.limitsOf(m.lab.ownerId)).labMembers <= 0) return { lab: m.lab, role: m.role, canPost, payer: userId, overCap: false };
  if (m.role === 'owner') return { lab: m.lab, role: m.role, canPost, payer: m.lab.ownerId, overCap: false };
  const overCap = m.creditCap != null && (await labSpend(d.db, m.lab, userId)) >= m.creditCap;
  return { lab: m.lab, role: m.role, canPost, payer: overCap ? userId : m.lab.ownerId, overCap };
}
