import { randomBytes } from 'node:crypto';
import { auth } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { pool } from '@/lib/db';
import { json, sameOrigin } from '@/lib/http';
import { isExpired, parseExpiry, passwordProblem } from '@/lib/share-access';
import { DEFAULT_THEME, isShareMode, isShareTheme } from '@/lib/share-themes';
import { hashSharePassword } from '@/lib/share-unlock';
import { siteURL } from '@/lib/site';
import { STYLES } from '@/lib/styles';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

type ShareRow = {
  shareToken: string | null; shareTheme: string | null; shareStyle: string | null; shareMode: string | null; shareViews: number;
  style: string; mode: string; title: string; shareExpiresAt: Date | null; locked: boolean;
};

/* the columns state() needs; the password hash itself is never read back out */
const COLS = `"shareToken", "shareTheme", "shareStyle", "shareMode", "shareViews", style, mode, title, "shareExpiresAt", ("sharePassword" is not null) as locked`;

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
    expiresAt: r.shareExpiresAt ? new Date(r.shareExpiresAt).toISOString() : null,
    expired: isExpired(r.shareExpiresAt),
    hasPassword: r.locked,
  };
}

/* Is this trace shared, and how? */
export async function GET(req: Request, { params }: Ctx) {
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return json({ error: 'Sign in first.' }, 401);
  const { id } = await params;
  const { rows } = await pool.query<ShareRow>(
    `select ${COLS} from trace where "userId" = $1 and id = $2`,
    [s.user.id, id],
  );
  const r = rows[0];
  if (!r) return json({ error: 'Save the trace first, then share it.' }, 404);
  return json(r.shareToken ? state(r) : { shared: false, title: r.title });
}

/* Turn on (or update) a read-only public link.
   Body: { theme?, style?, mode?, expires?, password? }
     expires:  'never' | '1d' | '7d' | '30d' | ISO date-time; left out = unchanged
     password: a string sets it, null removes it; left out = unchanged
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

  // expiry: undefined leaves it as it is
  let setExpiry = false;
  let expiresAt: Date | null = null;
  if (body.expires !== undefined) {
    const e = parseExpiry(body.expires);
    if ('error' in e) return json({ error: e.error }, 422);
    setExpiry = true;
    expiresAt = e.at;
  }
  // password: undefined leaves it, null removes it, a string sets it (stored hashed only)
  let setPassword = false;
  let hash: string | null = null;
  if (body.password !== undefined) {
    setPassword = true;
    if (body.password !== null) {
      const problem = passwordProblem(body.password);
      if (problem) return json({ error: `Password: ${problem}` }, 422);
      hash = await hashSharePassword(body.password);
    }
  }

  const token = randomBytes(12).toString('base64url');
  const { rows } = await pool.query<ShareRow & { fresh: boolean }>(
    `update trace set "shareToken" = coalesce("shareToken", $3), "shareStyle" = coalesce($4, "shareStyle", style), "shareMode" = coalesce($5, "shareMode", mode),
       "shareTheme" = coalesce($6, "shareTheme", $7),
       "shareExpiresAt" = case when $8 then $9::timestamptz else "shareExpiresAt" end,
       "sharePassword" = case when $10 then $11::text else "sharePassword" end
     where "userId" = $1 and id = $2
     returning ${COLS}, ("shareToken" = $3) as fresh`,
    [s.user.id, id, token, style, mode, theme, DEFAULT_THEME, setExpiry, expiresAt, setPassword, hash],
  );
  const r = rows[0];
  if (!r) return json({ error: 'Save the trace first, then share it.' }, 404);
  const out = state(r);
  if (r.fresh) await logActivity(s.user.id, 'trace.shared', { traceId: id, title: r.title, meta: { theme: out.theme, style: out.style } });
  return json(out);
}

/* Turn the public link off. The old URL stops working immediately, and its
   expiry and password go with it: a new link starts open, like before. */
export async function DELETE(req: Request, { params }: Ctx) {
  if (!sameOrigin(req)) return json({ error: 'Bad origin.' }, 403);
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return json({ error: 'Sign in first.' }, 401);
  const { id } = await params;
  const r = await pool.query<{ title: string; views: number }>(
    `update trace t set "shareToken" = null, "shareViews" = 0, "shareExpiresAt" = null, "sharePassword" = null from (select "shareViews" as views from trace where "userId" = $1 and id = $2 and "shareToken" is not null) o
     where t."userId" = $1 and t.id = $2 returning t.title, o.views`,
    [s.user.id, id],
  );
  if (r.rows[0]) await logActivity(s.user.id, 'trace.unshared', { traceId: id, title: r.rows[0].title, meta: { views: r.rows[0].views } });
  return json({ ok: true });
}
