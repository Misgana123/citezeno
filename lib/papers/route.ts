import 'server-only';
import { auth } from '@/lib/auth';
import { allow } from '@/lib/ratelimit';
import type { PapersConfig } from './config';
import { PapersError } from './errors';
import { newMeter } from './guard/meter';
import { guardedClient } from './guard/stack';
import { reserveSearches, type Reservation } from './guard/usage';
import type { OpenAlexClient } from './openalex/client';
import { parsePaperId } from './related/paper';
import { errorResponse, signedOut } from './respond';
import { parseSearchRequest, type SearchRequest } from './search/request';
import { papersServer } from './server';

/* Wraps every /api/papers handler: signed-in users only, a per-user request
   rate, the guarded OpenAlex client, the daily search limit, and every error
   turned into a friendly JSON response. */
export type PapersContext = {
  req: Request;
  userId: string;
  client: OpenAlexClient;
  config: PapersConfig;
  /* The validated search settings from the query string. */
  search(opts?: { requireQuery?: boolean }): SearchRequest;
  /* Hold n of the user's daily searches for this request; unused ones are given back. */
  reserve(n: number): Promise<void>;
};

/* Requests (of any kind) one user may make per minute, so a script can't hammer the API. */
const PER_MINUTE = 60;

export function papersRoute<P = Record<string, never>>(handler: (ctx: PapersContext, routeParams: P) => Promise<Response>) {
  return async (req: Request, { params }: { params: Promise<P> }) => {
    const s = await auth.api.getSession({ headers: req.headers });
    if (!s) return signedOut();
    const meter = newMeter();
    let reservation: Reservation | null = null;
    try {
      if (!(await allow(`papers:${s.user.id}`, 60, PER_MINUTE))) {
        throw new PapersError('busy', 'Too many requests from this user.', { reason: 'user_rate', retryAfterS: 30 });
      }
      const server = papersServer();
      const { config } = server.guard;
      const query = new URL(req.url).searchParams;
      return await handler(
        {
          req,
          userId: s.user.id,
          client: guardedClient(server.guard, meter),
          config,
          search: (opts = {}) => parseSearchRequest(query, { ...opts, maxQueryChars: config.maxQueryChars }),
          reserve: async (n) => {
            reservation = await reserveSearches(server.usage, s.user.id, n, config.dailySearchesPerUser);
          },
        },
        await params,
      );
    } catch (e) {
      return errorResponse(e);
    } finally {
      await (reservation as Reservation | null)?.settle(meter.searches);
    }
  };
}

/* For the /api/papers/[id]/... routes. */
export const paperIdRoute = (handler: (ctx: PapersContext, id: string) => Promise<Response>) =>
  papersRoute<{ id: string }>((ctx, { id }) => handler(ctx, parsePaperId(id)));
