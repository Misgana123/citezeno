import 'server-only';
import type { z } from 'zod';
import { auth } from '@/lib/auth';
import { planLimits, shelfConfigFor } from '@/lib/credits/limits';
import { pool } from '@/lib/db';
import { sameOrigin } from '@/lib/http';
import { PapersError } from '@/lib/papers/errors';
import { reserveSearches, type Reservation } from '@/lib/papers/guard/usage';
import { papersServer } from '@/lib/papers/server';
import { newMeter } from '@/lib/providers/gateway/meter';
import type { PaperSources } from '@/lib/providers/papers/sources';
import { allow } from '@/lib/ratelimit';
import { shelfConfig, type ShelfConfig } from './config';
import type { Db } from './db';
import { ShelfError } from './errors';
import { shelfErrorResponse, shelfSignedOut } from './respond';
import { actorDb, guestGate, spaceOf, type LabSpace } from '@/lib/labs/shelf';

/* Wraps every /api/shelf handler: signed-in users only, same-origin checks on
   changes, a per-user request rate, and errors turned into JSON. Paper data
   comes from the paper source, through the gateway (cache, rate limiter, cost
   logging, daily cap), and searches count toward the user's daily limit. */

export type ShelfContext = {
  req: Request;
  /* whose shelf: the user's own, or their lab's shelf account in the lab space */
  userId: string;
  /* who is acting (the signed-in user) */
  actorId: string;
  /* the lab space, when the request works on a lab's shelf */
  space: LabSpace | null;
  db: Db;
  config: ShelfConfig;
  /* The enabled paper sources, primary first (as Find Papers uses them), created on first use. */
  sources(): PaperSources;
  /* Hold n of the user's daily searches for this request; unused ones are given back. */
  reserveSearches(n: number): Promise<void>;
  /* The JSON body, validated. */
  body<S extends z.ZodType>(schema: S): Promise<z.infer<S>>;
};

/* Requests one user may make per minute (any kind). */
const PER_MINUTE = 120;

export function shelfRoute<P = Record<string, never>>(handler: (ctx: ShelfContext, params: P) => Promise<Response>) {
  return async (req: Request, { params }: { params: Promise<P> }) => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && !sameOrigin(req)) return Response.json({ error: 'Bad origin.', code: 'bad_request' }, { status: 403 });
    const s = await auth.api.getSession({ headers: req.headers });
    if (!s) return shelfSignedOut();
    const meter = newMeter();
    let sources: PaperSources | null = null;
    let reservation: Reservation | null = null;
    let release: (() => Promise<void>) | null = null;
    try {
      if (!(await allow(`shelf:${s.user.id}`, 60, PER_MINUTE))) {
        throw new PapersError('busy', 'Too many requests from this user.', { reason: 'user_rate', retryAfterS: 30 });
      }
      // the lab space: the lab's shelf, under the lab owner's plan, with who acted recorded
      const space = await spaceOf(pool, req, s.user.id);
      let db: Db = pool;
      if (space) {
        await guestGate(pool, space, req);
        const a = await actorDb(pool, s.user.id);
        db = a.db;
        release = a.release;
      }
      // the plan's limits (PDF size, storage, uploads, shelf size, searches) in place of the defaults
      const limits = await planLimits(space ? space.ownerId : s.user.id);
      return await handler(
        {
          req,
          userId: space ? space.shelfUserId : s.user.id,
          actorId: s.user.id,
          space,
          db,
          config: shelfConfigFor(shelfConfig(), limits),
          sources: () => (sources ??= papersServer().sources(meter)),
          reserveSearches: async (n) => {
            const server = papersServer();
            reservation = await reserveSearches(server.usage, s.user.id, n, limits.searchesPerDay);
          },
          body: async (schema) => {
            const raw = await req.json().catch(() => {
              throw new ShelfError('bad_request', 'The request could not be read.');
            });
            const r = schema.safeParse(raw);
            if (!r.success) throw new ShelfError('bad_request', r.error.issues[0]?.message || 'The request could not be read.');
            return r.data;
          },
        },
        await params,
      );
    } catch (e) {
      return shelfErrorResponse(e);
    } finally {
      await (reservation as Reservation | null)?.settle(meter.searches);
      await (release as (() => Promise<void>) | null)?.().catch(() => {});
    }
  };
}
