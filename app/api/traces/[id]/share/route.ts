import { randomBytes } from 'node:crypto';
import { auth } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { pool } from '@/lib/db';
import { json, sameOrigin } from '@/lib/http';
import { siteURL } from '@/lib/site';
import { STYLES } from '@/lib/styles';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };
const MODES = ['intext', 'footnotes', 'endnotes', 'list', 'annotated'];

/* Turn on (or update) a read-only public link. Body: { style?, mode? }. */
export async function POST(req: Request, { params }: Ctx) {
  if (!sameOrigin(req)) return json({ error: 'Bad origin.' }, 403);
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return json({ error: 'Sign in first.' }, 401);
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const style = STYLES[body.style] ? String(body.style) : null;
  const mode = MODES.includes(body.mode) ? String(body.mode) : null;
  const token = randomBytes(12).toString('base64url');
  const { rows } = await pool.query<{ shareToken: string; title: string; fresh: boolean }>(
    `update trace set "shareToken" = coalesce("shareToken", $3), "shareStyle" = coalesce($4, "shareStyle", style), "shareMode" = coalesce($5, "shareMode", mode)
     where "userId" = $1 and id = $2 returning "shareToken", title, ("shareToken" = $3) as fresh`,
    [s.user.id, id, token, style, mode],
  );
  if (!rows[0]) return json({ error: 'Save the trace first, then share it.' }, 404);
  if (rows[0].fresh) await logActivity(s.user.id, 'trace.shared', { traceId: id, title: rows[0].title });
  return json({ token: rows[0].shareToken, url: `${siteURL}/s/${rows[0].shareToken}` });
}

/* Turn the public link off. The old URL stops working immediately. */
export async function DELETE(req: Request, { params }: Ctx) {
  if (!sameOrigin(req)) return json({ error: 'Bad origin.' }, 403);
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return json({ error: 'Sign in first.' }, 401);
  const { id } = await params;
  const r = await pool.query<{ title: string; views: number }>(
    `update trace t set "shareToken" = null, "shareViews" = 0 from (select "shareViews" as views from trace where "userId" = $1 and id = $2 and "shareToken" is not null) o
     where t."userId" = $1 and t.id = $2 returning t.title, o.views`,
    [s.user.id, id],
  );
  if (r.rows[0]) await logActivity(s.user.id, 'trace.unshared', { traceId: id, title: r.rows[0].title, meta: { views: r.rows[0].views } });
  return json({ ok: true });
}
