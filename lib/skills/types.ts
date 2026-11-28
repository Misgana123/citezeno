/* Skills as the app shows them, and what can go wrong, in words for the user. */

export type Skill = {
  id: string;
  /* the name the user sees and picks ("literature-review") */
  name: string;
  description: string;
  /* made by Citezeno (its text is ours, not editable), by the user, or shared by their lab */
  by: 'citezeno' | 'you' | 'lab';
  category: string | null;
  enabled: boolean;
  /* messages it was used for */
  uses: number;
  updatedAt: string;
  /* the user's own and lab skills (built-in instructions stay on the server) */
  instructions?: string;
  /* a lab skill the user may change (lab admins) */
  canEdit?: boolean;
};

/* A built-in skill in Discover, and whether this user added it. */
export type SkillListing = { slug: string; description: string; category: string; added: boolean };

export type SkillCatalog = { mine: Skill[]; discover: SkillListing[] };

/* Limits for the user's own skills. */
export const SKILL_LIMITS = { own: 50, nameMax: 60, descriptionMax: 300, instructionsMax: 8000 } as const;

export type SkillErrorCode = 'bad_request' | 'not_found' | 'conflict' | 'limit' | 'forbidden';

export class SkillError extends Error {
  constructor(
    readonly code: SkillErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SkillError';
  }
}

export const isSkillError = (e: unknown): e is SkillError => (e as Error | null)?.name === 'SkillError' && typeof (e as SkillError).code === 'string';

export const SKILL_STATUS: Record<SkillErrorCode, number> = { bad_request: 400, not_found: 404, conflict: 409, limit: 409, forbidden: 403 };

/* A skill's name: lower case words joined by dashes ("My lab's APA style" → "my-labs-apa-style"). */
export function skillName(v: string): string {
  return v
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SKILL_LIMITS.nameMax)
    .replace(/-+$/, '');
}

/* A skill written as Markdown: optional front matter (name, description), then the instructions. */
export function parseSkillMarkdown(text: string, fallbackName = ''): { name: string; description: string; instructions: string } {
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(src);
  const meta: Record<string, string> = {};
  if (m) {
    for (const line of m[1].split('\n')) {
      const kv = /^([A-Za-z_-]+)\s*:\s*(.*)$/.exec(line.trim());
      if (kv) meta[kv[1].toLowerCase()] = kv[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  const body = (m ? m[2] : src).trim();
  // no name given: the first heading, else the file name
  const heading = /^#\s+(.+)$/m.exec(body)?.[1] ?? '';
  return { name: skillName(meta.name || heading || fallbackName.replace(/\.(md|markdown|txt)$/i, '')), description: (meta.description ?? '').slice(0, SKILL_LIMITS.descriptionMax), instructions: body };
}
