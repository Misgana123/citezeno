import 'server-only';
import { auth } from '@/lib/auth';
import { papersConfig, type PapersConfig } from './config';
import { parsePaperId } from './related/paper';
import type { OpenAlexClient } from './openalex/client';
import { errorResponse, signedOut } from './respond';
import { parseSearchRequest, type SearchRequest } from './search/request';
import { openalex } from './server';

/* Wraps every /api/papers handler: signed-in users only, one OpenAlex client,
   and every error turned into a friendly JSON response. */
export type PapersContext = {
  req: Request;
  userId: string;
  client: OpenAlexClient;
  config: PapersConfig;
  /* The validated search settings from the query string. */
  search(opts?: { requireQuery?: boolean }): SearchRequest;
};

export function papersRoute<P = Record<string, never>>(handler: (ctx: PapersContext, routeParams: P) => Promise<Response>) {
  return async (req: Request, { params }: { params: Promise<P> }) => {
    const s = await auth.api.getSession({ headers: req.headers });
    if (!s) return signedOut();
    try {
      const config = papersConfig();
      const query = new URL(req.url).searchParams;
      const search = (opts: { requireQuery?: boolean } = {}) => parseSearchRequest(query, { ...opts, maxQueryChars: config.maxQueryChars });
      return await handler({ req, userId: s.user.id, client: openalex(), config, search }, await params);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/* For the /api/papers/[id]/... routes. */
export const paperIdRoute = (handler: (ctx: PapersContext, id: string) => Promise<Response>) =>
  papersRoute<{ id: string }>((ctx, { id }) => handler(ctx, parsePaperId(id)));
