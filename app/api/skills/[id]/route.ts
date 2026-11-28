import { z } from 'zod';
import { json } from '@/lib/http';
import { skillRoute } from '@/lib/skills/route';
import { deleteSkill, updateSkill } from '@/lib/skills/store';
import { SKILL_LIMITS, SkillError } from '@/lib/skills/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patch = z.object({
  enabled: z.boolean().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(SKILL_LIMITS.descriptionMax).optional(),
  instructions: z.string().max(SKILL_LIMITS.instructionsMax + 500).optional(),
});

/* Switch a skill on or off, or change one of the user's own. */
export const PATCH = skillRoute<{ id: string }>(async ({ db, userId, body }, { id }) => json({ skill: await updateSkill(db, userId, id, await body(patch)) }));

/* Remove a skill (a Citezeno skill can be added again from Discover). */
export const DELETE = skillRoute<{ id: string }>(async ({ db, userId }, { id }) => {
  if (!(await deleteSkill(db, userId, id))) throw new SkillError('not_found', 'That skill no longer exists.');
  return json({ removed: true });
});
