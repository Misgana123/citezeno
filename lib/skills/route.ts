import 'server-only';
import type { z } from 'zod';
import { auth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { json, sameOrigin } from '@/lib/http';
import { allow } from '@/lib/ratelimit';
import type { Db } from '@/lib/shelf/db';
import { isSkillError, SKILL_STATUS, SkillError } from './types';

/* Wraps every /api/skills handler: signed-in users only, same-origin checks
   on changes, a per-user request rate, and errors turned into JSON. */

export type SkillContext = { req: Request; userId: string; db: Db; body<S extends z.ZodType>(schema: S): Promise<z.infer<S>> };

const PER_MINUTE = 60;

export function skillRoute<P = Record<string, never>>(handler: (ctx: SkillContext, params: P) => Promise<Response>) {
  return async (req: Request, { params }: { params: Promise<P> }) => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && !sameOrigin(req)) return json({ error: 'Bad origin.', code: 'bad_request' }, 403);
    const s = await auth.api.getSession({ headers: req.headers });
    if (!s) return json({ error: 'Sign in to use skills.', code: 'signed_out' }, 401);
    try {
      if (!(await allow(`skills:${s.user.id}`, 60, PER_MINUTE))) return json({ error: 'Too many requests. Try again in a moment.', code: 'busy' }, 429);
      return await handler(
        {
          req,
          userId: s.user.id,
          db: pool,
          body: async (schema) => {
            const r = schema.safeParse(await req.json().catch(() => null));
            if (!r.success) throw new SkillError('bad_request', r.error.issues[0]?.message || 'The request could not be read.');
            return r.data;
          },
        },
        await params,
      );
    } catch (e) {
      if (isSkillError(e)) return json({ error: e.message, code: e.code }, SKILL_STATUS[e.code]);
      console.error('[citezeno] skills: unexpected error', e);
      return json({ error: 'Something went wrong. Please try again.', code: 'unavailable' }, 500);
    }
  };
}
