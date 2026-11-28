import { randomUUID } from 'node:crypto';
import { iso, type Queryable } from '@/lib/shelf/db';
import { BUILTIN_SKILLS, builtinSkill } from './builtin';
import { SKILL_LIMITS, SkillError, skillName, type Skill, type SkillCatalog } from './types';

/* user_skill: the skills each user has. A built-in skill's row keeps only the
   switch and the count; its name and text come from code, so improving a
   built-in skill reaches everyone who added it. A lab skill belongs to the
   lab's shelf account (labId set): its admins write it, its members use it. */

/* The lab a request may see skills of: its shelf account, and whether the user manages it. */
export type SkillLab = { id: string; shelfUserId: string; manage: boolean };

type Row = { id: string; builtin: string | null; name: string; description: string; instructions: string; enabled: boolean; uses: number; updatedAt: Date; labId: string | null };
const COLS = `id, builtin, name, description, instructions, enabled, uses, "updatedAt", "labId"`;

function view(r: Row, lab?: SkillLab | null): Skill | null {
  if (r.builtin) {
    const b = builtinSkill(r.builtin);
    // a built-in skill we no longer ship is left out
    if (!b) return null;
    return { id: r.id, name: b.slug, description: b.description, by: 'citezeno', category: b.category, enabled: r.enabled, uses: r.uses, updatedAt: iso(r.updatedAt)! };
  }
  if (r.labId) return { id: r.id, name: r.name, description: r.description, by: 'lab', category: null, enabled: r.enabled, uses: r.uses, updatedAt: iso(r.updatedAt)!, instructions: r.instructions, canEdit: !!lab?.manage };
  return { id: r.id, name: r.name, description: r.description, by: 'you', category: null, enabled: r.enabled, uses: r.uses, updatedAt: iso(r.updatedAt)!, instructions: r.instructions };
}

/* Whose rows a request may read: the user's, and their lab's shared skills. */
const scope = (userId: string, lab?: SkillLab | null) => ({ where: `("userId" = $1 or ($2::text is not null and "userId" = $2 and "labId" is not null))`, args: [userId, lab?.shelfUserId ?? null] as unknown[] });

export async function listSkills(q: Queryable, userId: string, lab?: SkillLab | null): Promise<Skill[]> {
  const sc = scope(userId, lab);
  const { rows } = await q.query<Row>(`select ${COLS} from user_skill where ${sc.where} order by builtin is null, "labId" is not null, "createdAt"`, sc.args);
  return rows.map((r) => view(r, lab)).filter((s): s is Skill => s != null);
}

export async function skillCatalog(q: Queryable, userId: string, lab?: SkillLab | null): Promise<SkillCatalog> {
  const mine = await listSkills(q, userId, lab);
  const added = new Set(mine.filter((s) => s.by === 'citezeno').map((s) => s.name));
  return { mine, discover: BUILTIN_SKILLS.map((b) => ({ slug: b.slug, description: b.description, category: b.category, added: added.has(b.slug) })) };
}

const conflict = (e: unknown, message: string) => {
  if ((e as { code?: string })?.code === '23505') throw new SkillError('conflict', message);
  throw e;
};

/* Add a built-in skill (adding it again changes nothing). */
export async function addBuiltin(q: Queryable, userId: string, slug: string): Promise<Skill> {
  const b = builtinSkill(slug);
  if (!b) throw new SkillError('not_found', 'There is no such skill.');
  const { rows } = await q.query<Row>(
    `insert into user_skill (id, "userId", builtin, name) values ($1, $2, $3, $3)
     on conflict ("userId", builtin) where builtin is not null do update set enabled = true, "updatedAt" = now()
     returning ${COLS}`,
    [`sk_${randomUUID()}`, userId, b.slug],
  ).catch((e) => conflict(e, `You already have a skill called “${b.slug}”. Rename yours first.`));
  return view(rows[0])!;
}

type OwnInput = { name: string; description?: string; instructions: string };

function checkOwn(i: OwnInput): OwnInput {
  const name = skillName(i.name);
  if (name.length < 2) throw new SkillError('bad_request', 'Give the skill a name (letters or numbers).');
  if (BUILTIN_SKILLS.some((b) => b.slug === name)) throw new SkillError('conflict', `“${name}” is a Citezeno skill. Choose another name.`);
  const instructions = i.instructions.trim();
  if (!instructions) throw new SkillError('bad_request', 'Write the instructions the assistant should follow.');
  if (instructions.length > SKILL_LIMITS.instructionsMax) throw new SkillError('bad_request', `Instructions can be at most ${SKILL_LIMITS.instructionsMax.toLocaleString('en-US')} characters.`);
  return { name, description: (i.description ?? '').trim().slice(0, SKILL_LIMITS.descriptionMax), instructions };
}

/* A skill the user wrote (or uploaded as Markdown); with forLab, a lab skill (lab admins). */
export async function createOwn(q: Queryable, userId: string, input: OwnInput, forLab?: SkillLab | null): Promise<Skill> {
  if (forLab && !forLab.manage) throw new SkillError('forbidden', 'Only the lab’s owner and admins can add lab skills.');
  const i = checkOwn(input);
  const owner = forLab ? forLab.shelfUserId : userId;
  const { rows: count } = await q.query<{ n: string }>(`select count(*) as n from user_skill where "userId" = $1 and builtin is null`, [owner]);
  if (Number(count[0].n) >= SKILL_LIMITS.own) throw new SkillError('limit', `${forLab ? 'The lab' : 'You'} can have up to ${SKILL_LIMITS.own} skills of ${forLab ? 'its' : 'your'} own. Delete one first.`);
  const { rows } = await q
    .query<Row>(`insert into user_skill (id, "userId", name, description, instructions, "labId") values ($1, $2, $3, $4, $5, $6) returning ${COLS}`, [`sk_${randomUUID()}`, owner, i.name, i.description, i.instructions, forLab?.id ?? null])
    .catch((e) => conflict(e, `${forLab ? 'The lab already has' : 'You already have'} a skill called “${i.name}”.`));
  return view(rows[0], forLab)!;
}

/* Switch a skill on or off, or (the user's own) change its text. */
export async function updateSkill(q: Queryable, userId: string, id: string, patch: { enabled?: boolean } & Partial<OwnInput>, lab?: SkillLab | null): Promise<Skill> {
  const sc = scope(userId, lab);
  const { rows: found } = await q.query<Row>(`select ${COLS}, "userId" from user_skill where ${sc.where} and id = $3`, [...sc.args, id]);
  const cur = found[0] as (Row & { userId: string }) | undefined;
  if (!cur) throw new SkillError('not_found', 'That skill no longer exists.');
  if (cur.labId && !lab?.manage) throw new SkillError('forbidden', 'Only the lab’s owner and admins can change lab skills.');
  const ownerId = cur.userId;
  const editing = patch.name !== undefined || patch.description !== undefined || patch.instructions !== undefined;
  if (editing && cur.builtin) throw new SkillError('bad_request', 'Citezeno’s skills can’t be edited. Write your own instead.');
  const own = editing ? checkOwn({ name: patch.name ?? cur.name, description: patch.description ?? cur.description, instructions: patch.instructions ?? cur.instructions }) : null;
  const { rows } = await q
    .query<Row>(
      `update user_skill set enabled = coalesce($3, enabled), name = coalesce($4, name), description = coalesce($5, description), instructions = coalesce($6, instructions), "updatedAt" = now()
       where "userId" = $1 and id = $2 returning ${COLS}`,
      [ownerId, id, patch.enabled ?? null, own?.name ?? null, own?.description ?? null, own?.instructions ?? null],
    )
    .catch((e) => conflict(e, `There is already a skill called “${own?.name}”.`));
  return view(rows[0], lab)!;
}

export async function deleteSkill(q: Queryable, userId: string, id: string, lab?: SkillLab | null): Promise<boolean> {
  if (lab?.manage) {
    const { rowCount } = await q.query(`delete from user_skill where id = $1 and ("userId" = $2 or ("userId" = $3 and "labId" is not null))`, [id, userId, lab.shelfUserId]);
    return (rowCount ?? 0) > 0;
  }
  const { rows } = await q.query<{ labId: string | null }>(`select "labId" from user_skill where id = $1 and "userId" = $2`, [id, lab?.shelfUserId ?? '']);
  if (rows[0]) throw new SkillError('forbidden', 'Only the lab’s owner and admins can remove lab skills.');
  const { rowCount } = await q.query(`delete from user_skill where "userId" = $1 and id = $2`, [userId, id]);
  return (rowCount ?? 0) > 0;
}

/* The skill picked for a message, with its instructions (switched-on skills only); counted as used. */
export async function takeSkill(q: Queryable, userId: string, id: string, lab?: SkillLab | null): Promise<{ name: string; instructions: string } | null> {
  const sc = scope(userId, lab);
  const { rows } = await q.query<Row>(`update user_skill set uses = uses + 1 where ${sc.where} and id = $3 and enabled returning ${COLS}`, [...sc.args, id]);
  const r = rows[0];
  if (!r) return null;
  if (!r.builtin) return { name: r.name, instructions: r.instructions };
  const b = builtinSkill(r.builtin);
  return b ? { name: b.slug, instructions: b.instructions } : null;
}
