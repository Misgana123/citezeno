import { auth } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { pool } from '@/lib/db';
import { json, sameOrigin } from '@/lib/http';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

/* One full trace, in the same shape as a browser library entry. */
export async function GET(req: Request, { params }: Ctx) {
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return json({ error: 'Sign in first.' }, 401);
  const { id } = await params;
  const { rows } = await pool.query<{ id: string; title: string; style: string; mode: string; sources: number; data: { draft: string; result: unknown }; savedAt: Date }>(
    `select id, title, style, mode, sources, data, "savedAt" from trace where "userId" = $1 and id = $2`,
    [s.user.id, id],
  );
  const r = rows[0];
  if (!r) return json({ error: 'Not found.' }, 404);
  return json({ id: r.id, title: r.title, style: r.style, mode: r.mode, sources: r.sources, savedAt: new Date(r.savedAt).getTime(), draft: r.data.draft, result: r.data.result });
}

/* Rename. Body: { title }. */
export async function PATCH(req: Request, { params }: Ctx) {
  if (!sameOrigin(req)) return json({ error: 'Bad origin.' }, 403);
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return json({ error: 'Sign in first.' }, 401);
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!title) return json({ error: 'Give the trace a title.' }, 400);
  const r = await pool.query<{ old: string }>(
    `update trace t set title = $3, "titleLocked" = true from (select title as old from trace where "userId" = $1 and id = $2) o
     where t."userId" = $1 and t.id = $2 returning o.old`,
    [s.user.id, id, title],
  );
  if (!r.rowCount) return json({ error: 'Not found.' }, 404);
  if (r.rows[0].old !== title) await logActivity(s.user.id, 'trace.renamed', { traceId: id, title, meta: { from: r.rows[0].old } });
  return json({ ok: true, title });
}

export async function DELETE(req: Request, { params }: Ctx) {
  if (!sameOrigin(req)) return json({ error: 'Bad origin.' }, 403);
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return json({ error: 'Sign in first.' }, 401);
  const { id } = await params;
  const d = await pool.query<{ title: string }>(`delete from trace where "userId" = $1 and id = $2 returning title`, [s.user.id, id]);
  if (d.rows[0]) await logActivity(s.user.id, 'trace.deleted', { traceId: id, title: d.rows[0].title });
  return json({ ok: true });
}
