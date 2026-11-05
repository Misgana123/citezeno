import { pool } from './db';

/* Things a person did, for their history page. Logging never blocks or breaks
   the action itself: failures are only written to the server log. */
export type ActivityKind =
  | 'trace.created'
  | 'trace.renamed'
  | 'trace.deleted'
  | 'trace.shared'
  | 'trace.unshared'
  | 'auth.signin'
  | 'auth.password'
  | 'auth.2fa-on'
  | 'auth.2fa-off'
  | 'contact.sent';

export function logActivity(userId: string, kind: ActivityKind, o: { traceId?: string | null; title?: string | null; meta?: Record<string, unknown> } = {}) {
  return pool
    .query(`insert into activity ("userId", kind, "traceId", title, meta) values ($1, $2, $3, $4, $5)`, [
      userId,
      kind,
      o.traceId ?? null,
      o.title ? o.title.slice(0, 200) : null,
      JSON.stringify(o.meta ?? {}),
    ])
    .then(
      () => undefined,
      (e) => console.warn('[citezeno] activity log failed', kind, e?.message),
    );
}
