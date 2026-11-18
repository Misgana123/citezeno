import { pool } from '@/lib/db';
import { clientIp, json, sameOrigin } from '@/lib/http';
import { allow } from '@/lib/ratelimit';
import { PASSWORD_MAX, UNLOCK_MAX, UNLOCK_TTL_S, UNLOCK_WINDOW_S, isExpired } from '@/lib/share-access';
import { checkSharePassword, shareSecret, unlockCookie, unlockSignature } from '@/lib/share-unlock';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ token: string }> };

/* Open a password-protected shared link. Body: { password }.
   On success the browser gets a cookie for this link's page only. */
export async function POST(req: Request, { params }: Ctx) {
  if (!sameOrigin(req)) return json({ error: 'Bad origin.' }, 403);
  const { token } = await params;
  if (!/^[\w-]{10,40}$/.test(token)) return json({ error: 'This link doesn’t exist.' }, 404);

  // counted before the password is checked, like the sign-in limit
  if (!(await allow(`${clientIp(req)}/share-unlock/${token}`, UNLOCK_WINDOW_S, UNLOCK_MAX))) {
    return json({ error: 'Too many attempts. Wait a minute and try again.' }, 429);
  }

  const body = await req.json().catch(() => ({}));
  const password = typeof body.password === 'string' ? body.password.slice(0, PASSWORD_MAX) : '';
  const { rows } = await pool.query<{ sharePassword: string | null; pwTag: string | null; shareExpiresAt: Date | null }>(
    `select "sharePassword", md5("sharePassword") as "pwTag", "shareExpiresAt" from trace where "shareToken" = $1`,
    [token],
  );
  const r = rows[0];
  if (!r) return json({ error: 'This link doesn’t exist.' }, 404);
  if (isExpired(r.shareExpiresAt)) return json({ error: 'This link has expired.' }, 410);
  if (!r.sharePassword) return json({ ok: true });
  if (!password || !(await checkSharePassword(r.sharePassword, password))) return json({ error: 'That password isn’t right.' }, 401);

  const secret = shareSecret();
  if (!secret) return json({ error: 'Sharing isn’t set up on this server.' }, 500);
  const res = json({ ok: true });
  const secure = new URL(req.url).protocol === 'https:' || process.env.NODE_ENV === 'production';
  res.headers.append(
    'set-cookie',
    `${unlockCookie(token)}=${unlockSignature(secret, token, r.pwTag!)}; Path=/s/${token}; Max-Age=${UNLOCK_TTL_S}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`,
  );
  return res;
}
