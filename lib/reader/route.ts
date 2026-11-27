import 'server-only';
import type { z } from 'zod';
import { auth } from '@/lib/auth';
import { CREDIT_STATUS, InsufficientCredits, isCreditError } from '@/lib/credits/errors';
import { createMeter, type Meter } from '@/lib/credits/meter';
import { guardFor, planLimits } from '@/lib/credits/limits';
import { wallet } from '@/lib/credits/server';
import { json, sameOrigin } from '@/lib/http';
import { PapersError } from '@/lib/papers/errors';
import { errorResponse as papersErrorResponse } from '@/lib/papers/respond';
import { isProviderError } from '@/lib/providers/errors';
import { allow } from '@/lib/ratelimit';
import { isShelfError, SHELF_STATUS } from '@/lib/shelf/errors';
import type { ReaderDeps } from './deps';
import { isReaderError, READER_STATUS, ReaderError } from './errors';
import { readerDeps } from './server';

/* Wraps every /api/reader handler: signed-in users only, same-origin checks on
   changes, a per-user request rate, and errors turned into JSON. Every request
   is scoped to the signed-in user; private data is only ever theirs. */

export type ReaderContext = {
  req: Request;
  userId: string;
  deps: ReaderDeps;
  body<S extends z.ZodType>(schema: S): Promise<z.infer<S>>;
};

const PER_MINUTE = 240;

export function readerErrorResponse(e: unknown): Response {
  if (e instanceof InsufficientCredits) return json({ error: e.message, code: 'insufficient_credits', balance: e.balance, needed: e.needed }, 402);
  if (isCreditError(e)) return json({ error: e.message, code: e.code }, CREDIT_STATUS[e.code]);
  if (isReaderError(e)) return json({ error: e.message, code: e.code, ...(e.details.reason ? { reason: e.details.reason } : {}) }, READER_STATUS[e.code]);
  if (isShelfError(e)) return json({ error: e.message, code: e.code }, SHELF_STATUS[e.code]);
  if (e instanceof PapersError || (e as Error)?.name === 'PapersError') {
    const err = e as PapersError;
    return papersErrorResponse(new PapersError(err.code, err.message, err.details ?? {}));
  }
  if (isProviderError(e)) {
    if (e.code === 'busy') return json({ error: 'The service is busy. Please try again in a moment.', code: 'unavailable' }, 503);
    return json({ error: 'A service the reader needs is unavailable right now.', code: 'unavailable' }, 503);
  }
  console.error('[citezeno] reader: unexpected error', e);
  return json({ error: 'Something went wrong. Please try again.', code: 'unavailable' }, 500);
}

export function readerRoute<P = Record<string, never>>(handler: (ctx: ReaderContext, params: P) => Promise<Response>) {
  return async (req: Request, { params }: { params: Promise<P> }) => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && !sameOrigin(req)) return json({ error: 'Bad origin.', code: 'bad_request' }, 403);
    const s = await auth.api.getSession({ headers: req.headers });
    if (!s) return json({ error: 'Sign in to read papers.', code: 'signed_out' }, 401);
    try {
      if (!(await allow(`reader:${s.user.id}`, 60, PER_MINUTE))) throw new ReaderError('unavailable', 'Too many requests. Please wait a moment.', { reason: 'user_rate' });
      return await handler(
        {
          req,
          userId: s.user.id,
          deps: readerDeps(),
          body: async (schema) => {
            const raw = await req.json().catch(() => {
              throw new ReaderError('bad_request', 'The request could not be read.');
            });
            const r = schema.safeParse(raw);
            if (!r.success) throw new ReaderError('bad_request', r.error.issues[0]?.message || 'The request could not be read.');
            return r.data;
          },
        },
        await params,
      );
    } catch (e) {
      return readerErrorResponse(e);
    }
  };
}

/* One paid reader request (a summary, an answer, an explanation): the deps
   carry its credit meter, and `finish` settles it at the real cost — nothing
   when it failed, nothing when it turned out free (a saved summary). */
export function metered(ctx: ReaderContext, kind: string, meta: Record<string, unknown> = {}): { deps: ReaderDeps; meter: Meter; finish(ok: boolean): Promise<number | null> } {
  const meter = createMeter(wallet(), { userId: ctx.userId, kind, meta, guard: async () => guardFor(await planLimits(ctx.userId)) });
  return {
    deps: { ...ctx.deps, meter },
    meter,
    finish: async (ok) => {
      const bill = await meter.finish({ outcome: ok ? 'finished' : 'failed', useful: ok }).catch((e) => console.error('[citezeno] reader: settling credits failed', e));
      return bill ? bill.charged : null;
    },
  };
}

/* Run a paid reader request and settle its credits whatever happens. The
   result carries what it cost (`credits`, 0 when it was free). */
export async function charged<T extends object>(ctx: ReaderContext, kind: string, meta: Record<string, unknown>, run: (deps: ReaderDeps) => Promise<T>): Promise<T & { credits: number }> {
  const m = metered(ctx, kind, meta);
  let out: T;
  try {
    out = await run(m.deps);
  } catch (e) {
    await m.finish(false);
    throw e;
  }
  return { ...out, credits: (await m.finish(true)) ?? 0 };
}

/* "?pdf=" picks one of the user's own uploads of the paper. */
export const pdfParam = (req: Request) => new URL(req.url).searchParams.get('pdf')?.slice(0, 80) || null;
