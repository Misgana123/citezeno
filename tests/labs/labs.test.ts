import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { createConversation, getConversation, listConversations, loadMessages, appendMessages } from '@/lib/agent/store';
import { labChatFor, labProjectFor } from '@/lib/labs/chat';
import { actorDb, guestGate, spaceOf } from '@/lib/labs/shelf';
import * as labs from '@/lib/labs/service';
import { membershipOf } from '@/lib/labs/store';
import { limitsFor, NO_PLAN, type Limits } from '@/lib/plans';
import { skillLabOf } from '@/lib/skills/lab';
import { createOwn, listSkills, takeSkill, updateSkill } from '@/lib/skills/store';
import { createProject } from '@/lib/shelf/store/projects';
import { openTestDb, TEST_DB_URL, type TestDb } from '../shelf/testdb';

describe.skipIf(!TEST_DB_URL)('labs (postgres)', () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await openTestDb();
  });
  afterAll(async () => t?.close());

  /* People: their plan, and the emails sent to them. */
  async function world() {
    const plans = new Map<string, Limits>();
    const sent: { to: string; url: string; role: string }[] = [];
    const person = async (email: string, plan: Limits = NO_PLAN) => {
      const id = await t.addUser();
      await t.pool.query(`update "user" set email = $2, name = $3 where id = $1`, [id, email, email.split('@')[0]]);
      plans.set(id, plan);
      return { id, email };
    };
    const d: labs.LabDeps = { db: t.pool, limitsOf: async (u) => plans.get(u) ?? NO_PLAN, sendInvite: async (to, m) => void sent.push({ to, url: m.url, role: m.role }), siteURL: 'https://cz.test' };
    const tokenOf = (url: string) => new URL(url).searchParams.get('lab-invite')!;
    return { d, person, sent, tokenOf, plans };
  }

  it('makes a lab only on the Lab plan, one per person, with its own shelf account', async () => {
    const w = await world();
    const pro = await w.person('pro@x.org', limitsFor('pro'));
    await expect(labs.createLab(w.d, pro.id, 'Sleep Lab')).rejects.toMatchObject({ code: 'plan_required' });
    const owner = await w.person('own@x.org', limitsFor('lab'));
    const lab = await labs.createLab(w.d, owner.id, '  Sleep   Lab ');
    expect(lab.name).toBe('Sleep Lab');
    expect(lab.shelfUserId).not.toBe(owner.id);
    await expect(labs.createLab(w.d, owner.id, 'Again')).rejects.toMatchObject({ code: 'conflict' });
    expect((await labs.labView(w.d, owner.id))).toMatchObject({ role: 'owner', seats: 5, members: [{ userId: owner.id, role: 'owner' }] });
  });

  it('invites by email for that address only, once; the share link takes free seats', async () => {
    const w = await world();
    const owner = await w.person('o2@x.org', limitsFor('lab'));
    await labs.createLab(w.d, owner.id, 'Lab B');
    const ada = await w.person('ada@x.org');
    const bo = await w.person('bo@x.org');
    await labs.invite(w.d, owner.id, { email: 'ADA@x.org', role: 'member', inviterName: 'Owner' });
    const token = w.tokenOf(w.sent[0].url);
    await expect(labs.acceptInvite(w.d, bo, token)).rejects.toMatchObject({ code: 'forbidden' });
    await labs.acceptInvite(w.d, ada, token);
    await expect(labs.acceptInvite(w.d, ada, token)).rejects.toMatchObject({ code: 'expired' });
    expect((await membershipOf(t.pool, ada.id))?.role).toBe('member');
    // a member can't invite; the share link works for anyone, as a member
    await expect(labs.invite(w.d, ada.id, { email: 'z@x.org', role: 'member', inviterName: 'Ada' })).rejects.toMatchObject({ code: 'forbidden' });
    const url = await labs.setShareLink(w.d, owner.id, true);
    expect(await labs.setShareLink(w.d, owner.id, true)).toBe(url);
    await labs.acceptInvite(w.d, bo, w.tokenOf(url!));
    expect((await labs.labView(w.d, owner.id)).members.map((m) => m.role).sort()).toEqual(['member', 'member', 'owner']);
    await labs.setShareLink(w.d, owner.id, false);
    await expect(labs.acceptInvite(w.d, await w.person('c@x.org'), w.tokenOf(url!))).rejects.toMatchObject({ code: 'not_found' });
  });

  it('keeps to the plan’s seats (open email invitations count); guests take none', async () => {
    const w = await world();
    const owner = await w.person('o3@x.org', limitsFor('lab'));
    await labs.createLab(w.d, owner.id, 'Lab C');
    for (let i = 0; i < 5; i++) await labs.invite(w.d, owner.id, { email: `p${i}@x.org`, role: 'member', inviterName: 'O' });
    await expect(labs.invite(w.d, owner.id, { email: 'p6@x.org', role: 'member', inviterName: 'O' })).rejects.toMatchObject({ code: 'limit' });
    const { rows } = await t.pool.query(`insert into shelf_project (id, "userId", name) select 'pr_c', "shelfUserId", 'Thesis' from lab where "ownerId" = $1 returning id`, [owner.id]);
    await expect(labs.invite(w.d, owner.id, { email: 'guest@x.org', role: 'guest', projectId: rows[0].id, access: 'view', inviterName: 'O' })).resolves.toMatchObject({ role: 'guest' });
  });

  it('guests see only their project, read or edit as shared, and the shelf space checks it', async () => {
    const w = await world();
    const owner = await w.person('o4@x.org', limitsFor('lab'));
    const lab = await labs.createLab(w.d, owner.id, 'Lab D');
    const shared = await createProject(t.pool, lab.shelfUserId, 'Shared');
    const hidden = await createProject(t.pool, lab.shelfUserId, 'Hidden');
    const gus = await w.person('gus@x.org');
    await labs.invite(w.d, owner.id, { email: gus.email, role: 'guest', projectId: shared.id, access: 'view', inviterName: 'O' });
    await labs.acceptInvite(w.d, gus, w.tokenOf(w.sent.at(-1)!.url));
    expect(await membershipOf(t.pool, gus.id)).toBeNull();
    const req = (path: string, init: RequestInit = {}) => new Request(`https://cz.test/api/shelf${path}`, { ...init, headers: { 'x-cz-space': `lab:${lab.id}`, 'content-type': 'application/json', ...(init.headers ?? {}) } });
    const space = (await spaceOf(t.pool, req('/groups'), gus.id))!;
    expect(space).toMatchObject({ shelfUserId: lab.shelfUserId, role: 'guest' });
    await expect(guestGate(t.pool, space, req(`/papers?project=${shared.id}`))).resolves.toBeUndefined();
    await expect(guestGate(t.pool, space, req(`/papers?project=${hidden.id}`))).rejects.toMatchObject({ code: 'forbidden' });
    await expect(guestGate(t.pool, space, req('/papers', { method: 'POST', body: JSON.stringify({ projectId: shared.id }) }))).rejects.toMatchObject({ code: 'forbidden' });
    await expect(guestGate(t.pool, space, req('/projects', { method: 'POST', body: '{}' }))).rejects.toMatchObject({ code: 'forbidden' });
    // someone outside the lab can't even ask
    await expect(spaceOf(t.pool, req('/groups'), (await w.person('out@x.org')).id)).rejects.toMatchObject({ code: 'forbidden' });
    // edit access lets them add papers to that project
    await labs.setProjectAccess(w.d, owner.id, shared.id, gus.id, 'edit');
    const edit = (await spaceOf(t.pool, req('/groups'), gus.id))!;
    await expect(guestGate(t.pool, edit, req('/papers', { method: 'POST', body: JSON.stringify({ projectId: shared.id }) }))).resolves.toBeUndefined();
  });

  it('records who added a paper to the lab’s shelf', async () => {
    const w = await world();
    const owner = await w.person('o5@x.org', limitsFor('lab'));
    const lab = await labs.createLab(w.d, owner.id, 'Lab E');
    const { db, release } = await actorDb(t.pool, owner.id);
    try {
      await db.query(`insert into shelf_paper (id, "ownerId", title, origin, data) values ('p_e', $1, 'Paper E', 'manual', '{}')`, [lab.shelfUserId]);
      await db.query(`insert into shelf_item (id, "userId", "paperId", "addedVia") values ('i_e', $1, 'p_e', 'manual')`, [lab.shelfUserId]);
    } finally {
      await release();
    }
    expect((await t.pool.query(`select "addedBy" from shelf_item where id = 'i_e'`)).rows[0].addedBy).toBe(owner.id);
    // the connection went back to the pool without the actor
    expect((await t.pool.query(`select current_setting('cz.actor', true) as a`)).rows[0].a || '').toBe('');
  });

  it('copies papers from your shelf into a lab project', async () => {
    const w = await world();
    const owner = await w.person('o6@x.org', limitsFor('lab'));
    const lab = await labs.createLab(w.d, owner.id, 'Lab F');
    const proj = await createProject(t.pool, lab.shelfUserId, 'Review');
    await t.pool.query(`insert into shelf_paper (id, "ownerId", title, origin, data) values ('p_f', $1, 'Mine', 'manual', '{}')`, [owner.id]);
    await t.pool.query(`insert into shelf_item (id, "userId", "paperId", "addedVia", note) values ('i_f', $1, 'p_f', 'manual', 'my note')`, [owner.id]);
    expect(await labs.copyToLab(w.d, owner.id, ['i_f'], proj.id)).toEqual({ copied: 1, already: 0 });
    const { rows } = await t.pool.query(`select i.note, i."addedBy", p."ownerId", (select count(*) from shelf_item_project ip where ip."itemId" = i.id and ip."projectId" = $2) as inproj from shelf_item i join shelf_paper p on p.id = i."paperId" where i."userId" = $1`, [lab.shelfUserId, proj.id]);
    expect(rows).toEqual([{ note: 'my note', addedBy: owner.id, ownerId: lab.shelfUserId, inproj: '1' }]);
    await expect(labs.copyToLab(w.d, (await w.person('none@x.org')).id, ['i_f'], proj.id)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('hands the lab over only to someone on the Lab plan; deleting it removes its shelf', async () => {
    const w = await world();
    const owner = await w.person('o7@x.org', limitsFor('lab'));
    const lab = await labs.createLab(w.d, owner.id, 'Lab G');
    const ada = await w.person('ada7@x.org');
    await labs.acceptInvite(w.d, ada, w.tokenOf((await labs.setShareLink(w.d, owner.id, true))!));
    await expect(labs.transferLab(w.d, owner.id, ada.id)).rejects.toMatchObject({ code: 'plan_required' });
    await expect(labs.removeMember(w.d, owner.id, owner.id)).rejects.toMatchObject({ code: 'forbidden' });
    w.plans.set(ada.id, limitsFor('lab'));
    await labs.transferLab(w.d, owner.id, ada.id);
    expect((await membershipOf(t.pool, owner.id))?.role).toBe('admin');
    await expect(labs.deleteLab(w.d, owner.id)).rejects.toMatchObject({ code: 'forbidden' });
    await labs.deleteLab(w.d, ada.id);
    expect((await t.pool.query(`select count(*) as n from "user" where id = $1`, [lab.shelfUserId])).rows[0].n).toBe('0');
    expect(await membershipOf(t.pool, owner.id)).toBeNull();
  });

  it('a deleted owner takes the lab and its shelf account with them', async () => {
    const w = await world();
    const owner = await w.person('o8@x.org', limitsFor('lab'));
    const lab = await labs.createLab(w.d, owner.id, 'Lab H');
    await t.pool.query(`delete from "user" where id = $1`, [owner.id]);
    expect((await t.pool.query(`select count(*) as n from "user" where id = $1`, [lab.shelfUserId])).rows[0].n).toBe('0');
  });

  it('lab chats: the project’s people read them; who pays depends on role and cap; authors are kept', async () => {
    const w = await world();
    const owner = await w.person('o9@x.org', limitsFor('lab'));
    const lab = await labs.createLab(w.d, owner.id, 'Lab I');
    const proj = await createProject(t.pool, lab.shelfUserId, 'Chats');
    const mem = await w.person('mem9@x.org');
    await labs.acceptInvite(w.d, mem, w.tokenOf((await labs.setShareLink(w.d, owner.id, true))!));
    const out = await w.person('out9@x.org');

    expect(await labProjectFor(t.pool, mem.id, proj.id)).toMatchObject({ canEdit: true });
    expect(await labProjectFor(t.pool, out.id, proj.id)).toBeNull();
    const c = await createConversation(t.pool, mem.id, 'Lab chat', 'm', null, { labId: lab.id, projectId: proj.id });
    expect(await getConversation(t.pool, owner.id, c.id)).toMatchObject({ ownerId: mem.id, labId: lab.id });
    expect(await getConversation(t.pool, out.id, c.id)).toBeNull();
    expect((await listConversations(t.pool, owner.id)).find((x) => x.id === c.id)).toMatchObject({ lab: true, mine: false });

    expect(await labChatFor(w.d, mem.id, c)).toMatchObject({ canPost: true, payer: owner.id, overCap: false });
    await labs.updateMember(w.d, owner.id, mem.id, { creditCap: 10 });
    await t.pool.query(`insert into credit_action (id, "userId", kind, status, held, charged, meta, "expiresAt") values ('a9', $1, 'assistant', 'settled', 0, 12, $2, now() + interval '1 day')`, [owner.id, JSON.stringify({ labId: lab.id, memberId: mem.id })]);
    expect(await labChatFor(w.d, mem.id, c)).toMatchObject({ payer: mem.id, overCap: true });
    expect((await labs.labView(w.d, owner.id)).members.find((m) => m.userId === mem.id)?.usedThisMonth).toBe(12);
    // the owner left the Lab plan: everyone pays for themselves
    w.plans.set(owner.id, limitsFor('pro'));
    expect(await labChatFor(w.d, owner.id, c)).toMatchObject({ payer: owner.id });
    expect(await labChatFor(w.d, mem.id, c)).toMatchObject({ payer: mem.id });

    await appendMessages(t.pool, c.id, [{ message: { role: 'user', text: 'hi' } }, { message: { role: 'assistant', text: 'hello', toolCalls: [] } }], mem.id);
    expect((await loadMessages(t.pool, c.id)).map((m) => m.authorId ?? null)).toEqual([mem.id, null]);
  });

  it('lab skills: admins write them, members use them, guests and outsiders don’t see them', async () => {
    const w = await world();
    const owner = await w.person('o10@x.org', limitsFor('lab'));
    await labs.createLab(w.d, owner.id, 'Lab J');
    const mem = await w.person('mem10@x.org');
    await labs.acceptInvite(w.d, mem, w.tokenOf((await labs.setShareLink(w.d, owner.id, true))!));
    const ownerLab = (await skillLabOf(t.pool, owner.id))!;
    const memLab = (await skillLabOf(t.pool, mem.id))!;
    await expect(createOwn(t.pool, mem.id, { name: 'x', instructions: 'y' }, memLab)).rejects.toMatchObject({ code: 'forbidden' });
    const s = await createOwn(t.pool, owner.id, { name: 'Lab Style', instructions: 'Use APA.' }, ownerLab);
    expect(s).toMatchObject({ by: 'lab', canEdit: true });
    expect((await listSkills(t.pool, mem.id, memLab)).map((x) => [x.name, x.by, x.canEdit])).toEqual([['lab-style', 'lab', false]]);
    expect(await takeSkill(t.pool, mem.id, s.id, memLab)).toEqual({ name: 'lab-style', instructions: 'Use APA.' });
    await expect(updateSkill(t.pool, mem.id, s.id, { instructions: 'mine' }, memLab)).rejects.toMatchObject({ code: 'forbidden' });
    const out = await w.person('out10@x.org');
    expect(await takeSkill(t.pool, out.id, s.id, await skillLabOf(t.pool, out.id))).toBeNull();
  });
});
