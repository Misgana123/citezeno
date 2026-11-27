import 'server-only';
import type { z } from 'zod';
import { auth } from '@/lib/auth';
import { json, sameOrigin } from '@/lib/http';
import { newMeter } from '@/lib/providers/gateway/meter';
import { isProviderError } from '@/lib/providers/errors';
import { allow } from '@/lib/ratelimit';
import { shelfErrorResponse } from '@/lib/shelf/respond';
import type { ConnectorDeps } from './access';
import { CONNECTOR_STATUS, ConnectorError, isConnectorError } from './errors';
import { connectorDeps } from './server';

/* Wraps every /api/connectors handler: signed-in users only, same-origin
   checks on changes, a per-user request rate, and errors turned into JSON. */

export type ConnectorContext = {
  req: Request;
  userId: string;
  deps: ConnectorDeps;
  body<S extends z.ZodType>(schema: S): Promise<z.infer<S>>;
};

const PER_MINUTE = 60;

export function connectorErrorResponse(e: unknown): Response {
  if (isConnectorError(e)) return json({ error: e.message, code: e.code }, CONNECTOR_STATUS[e.code]);
  if (isProviderError(e)) {
    const status = e.code === 'not_found' ? 404 : e.code === 'bad_request' ? 400 : e.code === 'busy' ? 429 : 503;
    return json({ error: e.code === 'unavailable' ? 'The app didn’t answer. Please try again shortly.' : e.message, code: e.code }, status);
  }
  // shelf errors (imports, PDFs) keep the shelf's wording; anything else is logged there
  return shelfErrorResponse(e);
}

export function connectorRoute<P = Record<string, never>>(handler: (ctx: ConnectorContext, params: P) => Promise<Response>) {
  return async (req: Request, { params }: { params: Promise<P> }) => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && !sameOrigin(req)) return json({ error: 'Bad origin.', code: 'bad_request' }, 403);
    const s = await auth.api.getSession({ headers: req.headers });
    if (!s) return json({ error: 'Sign in to connect apps.', code: 'signed_out' }, 401);
    try {
      if (!(await allow(`connectors:${s.user.id}`, 60, PER_MINUTE))) return json({ error: 'Too many requests. Try again in a moment.', code: 'busy' }, 429);
      return await handler(
        {
          req,
          userId: s.user.id,
          deps: connectorDeps(newMeter()),
          body: async (schema) => {
            const raw = await req.json().catch(() => null);
            const r = schema.safeParse(raw);
            if (!r.success) throw new ConnectorError('bad_request', r.error.issues[0]?.message || 'The request could not be read.');
            return r.data;
          },
        },
        await params,
      );
    } catch (e) {
      return connectorErrorResponse(e);
    }
  };
}
