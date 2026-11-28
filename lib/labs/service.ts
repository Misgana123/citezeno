import { randomUUID } from 'node:crypto';
import type { Limits } from '@/lib/plans';
import { tx, type Db } from '@/lib/shelf/db';
import * as s from './store';
import { labSpendByMember } from './chat';
import { canManage, INVITE_DAYS, LAB_NAME_MAX, LabError, type Lab, type LabInvite, type LabRole, type LabView, type Membership } from './types';

/* What a lab does, with its rules: who may invite, change roles, set caps and
   delete; how many people the owner's plan allows; how invitations work. */

export type LabDeps = {
  db: Db;
  /* the plan limits of a user (no plan: none) */
  limitsOf(userId: string): Promise<Limits>;
  /* sends an invitation email (best effort) */
  sendInvite(to: string, m: { inviter: string; lab: string; role: LabRole; url: string }): Promise<void>;
  siteURL: string;
  now?: () => Date;
};

const nowOf = (d: LabDeps) => (d.now ?? (() => new Date()))();
const cleanName = (name: string) => {
  const n = name.replace(/\s+/g, ' ').trim().slice(0, LAB_NAME_MAX);
  if (!n) throw new LabError('bad_request', 'Give the lab a name.');
  return n;
};
export const inviteUrl = (siteURL: string, token: string) => `${siteURL.replace(/\/$/, '')}/app/chat?lab-invite=${encodeURIComponent(token)}`;

/* The lab someone manages; otherwise a plain refusal. */
async function managed(d: LabDeps, userId: string): Promise<Membership> {
  const m = await s.membershipOf(d.db, userId);
  if (!m) throw new LabError('not_found', 'You aren’t in a lab.');
  if (!canManage(m.role)) throw new LabError('forbidden', 'Only the lab’s owner and admins can do this.');
  return m;
}

/* How many people besides the owner the lab may have (from the owner's plan). */
const seatsOf = async (d: LabDeps, lab: Lab) => (await d.limitsOf(lab.ownerId)).labMembers;

export async function labView(d: LabDeps, userId: string): Promise<LabView> {
  const m = await s.membershipOf(d.db, userId);
  const guestOf = await s.guestLabs(d.db, userId);
  if (!m) {
    const seats = (await d.limitsOf(userId)).labMembers;
    return { lab: null, role: null, members: [], invites: [], link: { on: false, url: null }, seats, canCreate: seats > 0, guestOf };
  }
  const manage = canManage(m.role);
  const [list, invites, token, seats, spend] = await Promise.all([
    s.listMembers(d.db, m.lab.id),
    manage ? s.listInvites(d.db, m.lab.id, nowOf(d)) : [],
    manage ? s.shareLink(d.db, m.lab.id) : null,
    seatsOf(d, m.lab),
    labSpendByMember(d.db, m.lab, nowOf(d)),
  ]);
  // this month's lab credits: everyone's for the owner and admins, your own otherwise
  const members = list.map((x) => (manage || x.userId === userId ? { ...x, usedThisMonth: spend.get(x.userId) ?? 0 } : x));
  return {
    lab: { id: m.lab.id, name: m.lab.name, createdAt: m.lab.createdAt },
    role: m.role,
    members,
    invites,
    link: { on: !!token, url: token ? inviteUrl(d.siteURL, token) : null },
    seats,
    canCreate: false,
    guestOf,
  };
}

export async function createLab(d: LabDeps, userId: string, name: string): Promise<Lab> {
  const n = cleanName(name);
  if ((await d.limitsOf(userId)).labMembers <= 0) throw new LabError('plan_required', 'A lab comes with the Lab plan. Choose it on the pricing page.');
  if (await s.membershipOf(d.db, userId)) throw new LabError('conflict', 'You’re already in a lab. Leave it first.');
  return tx(d.db, (q) => s.insertLab(q, userId, n));
}

export async function renameLab(d: LabDeps, userId: string, name: string): Promise<void> {
  const m = await managed(d, userId);
  await s.renameLab(d.db, m.lab.id, cleanName(name));
}

export async function deleteLab(d: LabDeps, userId: string): Promise<void> {
  const m = await s.membershipOf(d.db, userId);
  if (!m || m.role !== 'owner') throw new LabError('forbidden', 'Only the lab’s owner can delete it.');
  await s.deleteLab(d.db, m.lab);
}

/* Invite by email: a member or admin (a seat), or a guest on one project. */
export async function invite(d: LabDeps, userId: string, i: { email: string; role: 'admin' | 'member' | 'guest'; projectId?: string | null; access?: 'view' | 'edit' | null; inviterName: string }): Promise<LabInvite> {
  const m = await managed(d, userId);
  const email = i.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new LabError('bad_request', 'Enter a valid email address.');
  if (i.role === 'admin' && m.role !== 'owner') throw new LabError('forbidden', 'Only the owner can invite admins.');
  if (i.role === 'guest') {
    if (!i.projectId) throw new LabError('bad_request', 'Choose the project to share with the guest.');
    const { rowCount } = await d.db.query(`select 1 from shelf_project where id = $1 and "userId" = $2`, [i.projectId, m.lab.shelfUserId]);
    if (!rowCount) throw new LabError('not_found', 'That project isn’t in the lab.');
  } else {
    const seats = await seatsOf(d, m.lab);
    if ((await s.seatsTaken(d.db, m.lab.id, nowOf(d))) >= seats) throw new LabError('limit', seats ? `The lab is full: ${seats} people besides the owner. Remove someone or cancel an invitation first.` : 'The owner’s plan no longer includes a lab.');
  }
  const { rows: already } = await d.db.query(`select 1 from lab_member m join "user" u on u.id = m."userId" where m."labId" = $1 and lower(u.email) = $2 and m.role <> 'guest'`, [m.lab.id, email]);
  if (already.length) throw new LabError('conflict', 'That person is already in the lab.');
  const expiresAt = new Date(nowOf(d).getTime() + INVITE_DAYS * 86_400_000);
  const { invite: made, token } = await s.insertInvite(d.db, { labId: m.lab.id, email, role: i.role, projectId: i.role === 'guest' ? i.projectId : null, access: i.role === 'guest' ? (i.access ?? 'view') : null, createdBy: userId, expiresAt, keepToken: false });
  await d.sendInvite(email, { inviter: i.inviterName, lab: m.lab.name, role: i.role, url: inviteUrl(d.siteURL, token) }).catch((e) => console.warn('[citezeno] labs: invitation email failed', (e as Error).message));
  return made;
}

export async function cancelInvite(d: LabDeps, userId: string, id: string): Promise<void> {
  const m = await managed(d, userId);
  if (!(await s.deleteInvite(d.db, m.lab.id, id))) throw new LabError('not_found', 'That invitation no longer exists.');
}

/* The share link: anyone with it joins as a member (while seats are free). */
export async function setShareLink(d: LabDeps, userId: string, on: boolean): Promise<string | null> {
  const m = await managed(d, userId);
  if (!on) {
    await s.deleteShareLinks(d.db, m.lab.id);
    return null;
  }
  const token = await s.shareLink(d.db, m.lab.id);
  if (token) return inviteUrl(d.siteURL, token);
  const made = await s.insertInvite(d.db, { labId: m.lab.id, email: null, role: 'member', createdBy: userId, expiresAt: null, keepToken: true });
  return inviteUrl(d.siteURL, made.token);
}

/* What an invitation is for, to show before joining. */
export async function inviteInfo(d: LabDeps, token: string): Promise<{ lab: string; role: LabRole; inviter: string | null; email: string | null }> {
  const inv = await valid(d, token);
  const lab = await s.getLab(d.db, inv.labId);
  const { rows } = inv.createdBy ? await d.db.query<{ name: string | null }>(`select name from "user" where id = $1`, [inv.createdBy]) : { rows: [] as { name: string | null }[] };
  return { lab: lab?.name ?? 'a lab', role: inv.role, inviter: rows[0]?.name ?? null, email: inv.email };
}

async function valid(d: LabDeps, token: string) {
  const inv = await s.inviteByToken(d.db, token);
  if (!inv) throw new LabError('not_found', 'This invitation link isn’t valid (it may have been cancelled).');
  if (inv.usedAt) throw new LabError('expired', 'This invitation was already used.');
  if (inv.expiresAt && new Date(inv.expiresAt) <= nowOf(d)) throw new LabError('expired', 'This invitation has expired. Ask for a new one.');
  return inv;
}

export async function acceptInvite(d: LabDeps, user: { id: string; email: string }, token: string): Promise<Lab> {
  const inv = await valid(d, token);
  if (inv.email && inv.email !== user.email.trim().toLowerCase()) throw new LabError('forbidden', `This invitation is for ${inv.email}. Sign in with that email to join.`);
  const lab = await s.getLab(d.db, inv.labId);
  if (!lab) throw new LabError('not_found', 'That lab no longer exists.');
  return tx(d.db, async (q) => {
    if (inv.role === 'guest') {
      const here = await s.memberIn(q, lab.id, user.id);
      if (!here) await s.addMember(q, lab.id, user.id, 'guest');
      if (inv.projectId && (!here || here.role === 'guest')) await s.grantProject(q, lab.id, inv.projectId, user.id, inv.access ?? 'view');
    } else {
      const mine = await s.membershipOf(q, user.id);
      if (mine?.lab.id === lab.id) return lab;
      if (mine) throw new LabError('conflict', `You’re already in the lab “${mine.lab.name}”. Leave it first.`);
      // a share link takes a free seat; an email invitation already holds one
      if (!inv.email && (await s.seatsTaken(q, lab.id, nowOf(d))) >= (await seatsOf(d, lab))) throw new LabError('limit', 'The lab is full. Ask its owner to make room.');
      await s.addMember(q, lab.id, user.id, inv.role);
      await q.query(`delete from lab_project_access where "labId" = $1 and "userId" = $2`, [lab.id, user.id]);
    }
    await s.markInviteUsed(q, inv.id);
    return lab;
  });
}

/* Change someone's role or credit cap; the owner changes admins, admins change members. */
export async function updateMember(d: LabDeps, userId: string, target: string, p: { role?: 'admin' | 'member'; creditCap?: number | null }): Promise<void> {
  const m = await managed(d, userId);
  const them = await s.memberIn(d.db, m.lab.id, target);
  if (!them) throw new LabError('not_found', 'That person isn’t in the lab.');
  if (them.role === 'owner') throw new LabError('forbidden', 'The owner’s role can’t be changed. The owner can hand the lab over instead.');
  if ((them.role === 'admin' || p.role === 'admin') && m.role !== 'owner') throw new LabError('forbidden', 'Only the owner can change admins.');
  if (p.role) {
    if (them.role === 'guest' && (await s.seatsTaken(d.db, m.lab.id, nowOf(d))) >= (await seatsOf(d, m.lab))) throw new LabError('limit', 'The lab is full: there’s no seat to turn this guest into a member.');
    await s.setRole(d.db, m.lab.id, target, p.role);
  }
  if (p.creditCap !== undefined) await s.setCap(d.db, m.lab.id, target, p.creditCap);
}

/* Remove someone (or leave, for yourself). */
export async function removeMember(d: LabDeps, userId: string, target: string, labId?: string): Promise<void> {
  if (target === userId) {
    const m = labId ? await s.memberIn(d.db, labId, userId) : await s.membershipOf(d.db, userId);
    if (!m) throw new LabError('not_found', 'You aren’t in that lab.');
    if (m.role === 'owner') throw new LabError('forbidden', 'The owner can’t leave. Hand the lab over to someone, or delete it.');
    await s.removeMember(d.db, m.lab.id, userId);
    return;
  }
  const m = await managed(d, userId);
  const them = await s.memberIn(d.db, m.lab.id, target);
  if (!them) throw new LabError('not_found', 'That person isn’t in the lab.');
  if (them.role === 'owner') throw new LabError('forbidden', 'The owner can’t be removed.');
  if (them.role === 'admin' && m.role !== 'owner') throw new LabError('forbidden', 'Only the owner can remove admins.');
  await s.removeMember(d.db, m.lab.id, target);
}

/* Hand the lab over: the new owner needs the Lab plan (their credits then pay for the lab). */
export async function transferLab(d: LabDeps, userId: string, target: string): Promise<void> {
  const m = await s.membershipOf(d.db, userId);
  if (!m || m.role !== 'owner') throw new LabError('forbidden', 'Only the owner can hand the lab over.');
  const them = await s.memberIn(d.db, m.lab.id, target);
  if (!them || them.role === 'guest' || them.role === 'owner') throw new LabError('bad_request', 'Choose an admin or member of the lab.');
  if ((await d.limitsOf(target)).labMembers <= 0) throw new LabError('plan_required', 'The new owner needs the Lab plan first: the lab’s credits come from the owner’s plan.');
  await tx(d.db, (q) => s.setOwner(q, m.lab.id, userId, target));
}

/* Share a lab project with a guest who is already in the lab, or change / end their access. */
export async function setProjectAccess(d: LabDeps, userId: string, projectId: string, target: string, access: 'view' | 'edit' | null): Promise<void> {
  const m = await managed(d, userId);
  const { rowCount } = await d.db.query(`select 1 from shelf_project where id = $1 and "userId" = $2`, [projectId, m.lab.shelfUserId]);
  if (!rowCount) throw new LabError('not_found', 'That project isn’t in the lab.');
  const them = await s.memberIn(d.db, m.lab.id, target);
  if (!them || them.role !== 'guest') throw new LabError('bad_request', 'Only guests are given single projects; members see the whole lab.');
  if (access) await s.grantProject(d.db, m.lab.id, projectId, target, access);
  else await s.revokeProject(d.db, projectId, target);
}

/* The guests of one lab project (for its Share panel). */
export async function projectGuests(d: LabDeps, userId: string, projectId: string) {
  const m = await managed(d, userId);
  const { rowCount } = await d.db.query(`select 1 from shelf_project where id = $1 and "userId" = $2`, [projectId, m.lab.shelfUserId]);
  if (!rowCount) throw new LabError('not_found', 'That project isn’t in the lab.');
  return s.projectPeople(d.db, projectId);
}

/* Copy papers from your own shelf into a lab project: the paper, its note and
   reading status (PDFs stay with you). Papers already in the lab just join the project. */
export async function copyToLab(d: LabDeps, userId: string, itemIds: string[], projectId: string): Promise<{ copied: number; already: number }> {
  const m = await s.membershipOf(d.db, userId);
  if (!m) throw new LabError('not_found', 'You aren’t in a lab.');
  const lab = m.lab;
  const { rowCount: isLab } = await d.db.query(`select 1 from shelf_project where id = $1 and "userId" = $2`, [projectId, lab.shelfUserId]);
  if (!isLab) throw new LabError('not_found', 'That project isn’t in the lab.');
  const ids = [...new Set(itemIds)].slice(0, 500);
  const { rows: items } = await d.db.query<{ paperId: string; ownerId: string | null; addedVia: string; note: string | null; readingStatus: string }>(
    `select i."paperId", p."ownerId", i."addedVia", i.note, i."readingStatus" from shelf_item i join shelf_paper p on p.id = i."paperId" where i."userId" = $1 and i.id = any($2::text[])`,
    [userId, ids],
  );
  const max = (await d.limitsOf(lab.ownerId)).shelfPapers;
  return tx(d.db, async (q) => {
    const { rows: n } = await q.query<{ n: string }>(`select count(*) as n from shelf_item where "userId" = $1`, [lab.shelfUserId]);
    if (Number(n[0].n) + items.length > max) throw new LabError('limit', `The lab’s shelf holds ${max.toLocaleString('en-US')} papers. Remove some first, or copy fewer.`);
    let copied = 0;
    let already = 0;
    for (const it of items) {
      let paperId = it.paperId;
      // a paper only you had (typed in or imported) gets its own copy in the lab
      if (it.ownerId) {
        const { rows } = await q.query<{ id: string }>(
          `insert into shelf_paper (id, "ownerId", provider, doi, title, year, "citedByCount", "isOpenAccess", "isRetracted", origin, data, "searchText")
           select $3, $2, provider, doi, title, year, "citedByCount", "isOpenAccess", "isRetracted", origin, data, "searchText" from shelf_paper where id = $1
           returning id`,
          [it.paperId, lab.shelfUserId, `p_${randomUUID()}`],
        );
        paperId = rows[0].id;
      }
      const { rows: made } = await q.query<{ id: string }>(
        `insert into shelf_item (id, "userId", "paperId", "addedVia", note, "readingStatus", "addedBy") values ($6, $1, $2, $3, $4, 'to_read', $5)
         on conflict ("userId", "paperId") do nothing returning id`,
        [lab.shelfUserId, paperId, it.addedVia === 'upload' ? 'manual' : it.addedVia, it.note, userId, `i_${randomUUID()}`],
      );
      let itemId = made[0]?.id;
      if (itemId) copied++;
      else {
        already++;
        itemId = (await q.query<{ id: string }>(`select id from shelf_item where "userId" = $1 and "paperId" = $2`, [lab.shelfUserId, paperId])).rows[0]?.id;
      }
      if (itemId) await q.query(`insert into shelf_item_project ("itemId", "projectId") values ($1, $2) on conflict do nothing`, [itemId, projectId]);
    }
    return { copied, already };
  });
}
