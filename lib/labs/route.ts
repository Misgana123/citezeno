import 'server-only';
import type { z } from 'zod';
import { auth } from '@/lib/auth';
import { json, sameOrigin } from '@/lib/http';
import { allow } from '@/lib/ratelimit';
import type { LabDeps } from './service';
import { labDeps } from './server';
import { isLabError, LAB_STATUS, LabError } from './types';

/* Wraps every /api/labs handler: signed-in users only, same-origin checks on
   changes, a per-user request rate, and errors turned into JSON. */

export type LabContext = { req: Request; user: { id: string; name: string; email: string }; deps: LabDeps; body<S extends z.ZodType>(schema: S): Promise<z.infer<S>> };

export function labRoute<P = Record<string, never>>(handler: (ctx: LabContext, params: P) => Promise<Response>) {
  return async (req: Request, { params }: { params: Promise<P> }) => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && !sameOrigin(req)) return json({ error: 'Bad origin.', code: 'bad_request' }, 403);
    const s = await auth.api.getSession({ headers: req.headers });
    if (!s) return json({ error: 'Sign in to use labs.', code: 'signed_out' }, 401);
    try {
      if (!(await allow(`labs:${s.user.id}`, 60, 60))) return json({ error: 'Too many requests. Try again in a moment.', code: 'busy' }, 429);
      return await handler(
        {
          req,
          user: { id: s.user.id, name: s.user.name, email: s.user.email },
          deps: labDeps(),
          body: async (schema) => {
            const r = schema.safeParse(await req.json().catch(() => null));
            if (!r.success) throw new LabError('bad_request', r.error.issues[0]?.message || 'The request could not be read.');
            return r.data;
          },
        },
        await params,
      );
    } catch (e) {
      if (isLabError(e)) return json({ error: e.message, code: e.code }, LAB_STATUS[e.code]);
      if ((e as { code?: string })?.code === '23505') return json({ error: 'That’s already done.', code: 'conflict' }, 409);
      console.error('[citezeno] labs: unexpected error', e);
      return json({ error: 'Something went wrong. Please try again.', code: 'unavailable' }, 500);
    }
  };
}
