import { auth } from '@/lib/auth';
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

export async function DELETE(req: Request, { params }: Ctx) {
  if (!sameOrigin(req)) return json({ error: 'Bad origin.' }, 403);
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return json({ error: 'Sign in first.' }, 401);
  const { id } = await params;
  await pool.query(`delete from trace where "userId" = $1 and id = $2`, [s.user.id, id]);
  return json({ ok: true });
}
