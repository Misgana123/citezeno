import { randomBytes } from 'node:crypto';
import { auth } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { pool } from '@/lib/db';
import { json, sameOrigin } from '@/lib/http';
import { DEFAULT_THEME, isShareMode, isShareTheme } from '@/lib/share-themes';
import { siteURL } from '@/lib/site';
import { STYLES } from '@/lib/styles';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

type ShareRow = { shareToken: string | null; shareTheme: string | null; shareStyle: string | null; shareMode: string | null; shareViews: number; style: string; mode: string; title: string };

/* The link's current settings, as the share dialog shows them. */
function state(r: ShareRow) {
  return {
    shared: true as const,
    title: r.title,
    token: r.shareToken!,
    url: `${siteURL}/s/${r.shareToken}`,
    theme: isShareTheme(r.shareTheme) ? r.shareTheme : DEFAULT_THEME,
    style: STYLES[r.shareStyle || ''] ? r.shareStyle! : STYLES[r.style] ? r.style : 'apa',
    mode: isShareMode(r.shareMode) ? r.shareMode : isShareMode(r.mode) ? r.mode : 'intext',
    views: r.shareViews,
  };
}

/* Is this trace shared, and how? */
export async function GET(req: Request, { params }: Ctx) {
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return json({ error: 'Sign in first.' }, 401);
  const { id } = await params;
  const { rows } = await pool.query<ShareRow>(
    `select "shareToken", "shareTheme", "shareStyle", "shareMode", "shareViews", style, mode, title from trace where "userId" = $1 and id = $2`,
    [s.user.id, id],
  );
  const r = rows[0];
  if (!r) return json({ error: 'Save the trace first, then share it.' }, 404);
  return json(r.shareToken ? state(r) : { shared: false, title: r.title });
}

/* Turn on (or update) a read-only public link. Body: { theme?, style?, mode? }.
   Updating keeps the same token, so a link that is already out there never changes. */
export async function POST(req: Request, { params }: Ctx) {
  if (!sameOrigin(req)) return json({ error: 'Bad origin.' }, 403);
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return json({ error: 'Sign in first.' }, 401);
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const style = STYLES[body.style] ? String(body.style) : null;
  const mode = isShareMode(body.mode) ? body.mode : null;
  const theme = isShareTheme(body.theme) ? body.theme : null;
  const token = randomBytes(12).toString('base64url');
  const { rows } = await pool.query<ShareRow & { fresh: boolean }>(
    `update trace set "shareToken" = coalesce("shareToken", $3), "shareStyle" = coalesce($4, "shareStyle", style), "shareMode" = coalesce($5, "shareMode", mode),
       "shareTheme" = coalesce($6, "shareTheme", $7)
     where "userId" = $1 and id = $2
     returning "shareToken", "shareTheme", "shareStyle", "shareMode", "shareViews", style, mode, title, ("shareToken" = $3) as fresh`,
    [s.user.id, id, token, style, mode, theme, DEFAULT_THEME],
  );
  const r = rows[0];
  if (!r) return json({ error: 'Save the trace first, then share it.' }, 404);
  const out = state(r);
  if (r.fresh) await logActivity(s.user.id, 'trace.shared', { traceId: id, title: r.title, meta: { theme: out.theme, style: out.style } });
  return json(out);
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
