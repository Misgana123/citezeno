import { z } from 'zod';
import { json } from '@/lib/http';
import { skillRoute } from '@/lib/skills/route';
import { addBuiltin, createOwn, skillCatalog } from '@/lib/skills/store';
import { parseSkillMarkdown, SKILL_LIMITS } from '@/lib/skills/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* This user's skills, and Citezeno's skills they can add. */
export const GET = skillRoute(async ({ db, userId }) => json(await skillCatalog(db, userId)));

const body = z.union([
  /* add one of Citezeno's skills */
  z.object({ builtin: z.string().trim().min(1).max(80) }),
  /* upload a skill written as Markdown */
  z.object({ markdown: z.string().max(SKILL_LIMITS.instructionsMax + 2000, 'The file is too long for a skill.'), fileName: z.string().trim().max(200).optional() }),
  /* write one */
  z.object({ name: z.string().trim().min(1, 'Give the skill a name.').max(120), description: z.string().max(SKILL_LIMITS.descriptionMax).optional(), instructions: z.string().max(SKILL_LIMITS.instructionsMax + 500) }),
]);

export const POST = skillRoute(async ({ db, userId, body: read }) => {
  const b = await read(body);
  if ('builtin' in b) return json({ skill: await addBuiltin(db, userId, b.builtin) }, 201);
  if ('markdown' in b) return json({ skill: await createOwn(db, userId, parseSkillMarkdown(b.markdown, b.fileName)) }, 201);
  return json({ skill: await createOwn(db, userId, b) }, 201);
});
