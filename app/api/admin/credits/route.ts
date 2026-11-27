import { auth } from '@/lib/auth';
import { wallet } from '@/lib/credits/server';
import { pool } from '@/lib/db';
import { json, sameOrigin } from '@/lib/http';
import { isAdmin } from '@/lib/admin';

export const runtime = 'nodejs';

/* Give (positive) or take back (negative) credits. Body: { userId, amount, note, days? }.
   Given credits are a promo lot that ends after `days` (default 90; 0 = never). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Bad origin.' }, 403);
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s || !isAdmin(s.user)) return json({ error: 'Not found.' }, 404);
  const body = await req.json().catch(() => ({}));
  const userId = String(body.userId ?? '');
  const amount = Math.trunc(Number(body.amount));
  const note = String(body.note ?? '').slice(0, 200);
  const days = body.days == null || body.days === '' ? 90 : Math.max(0, Math.min(3650, Math.trunc(Number(body.days)) || 0));
  if (!userId || !Number.isFinite(amount) || !amount || Math.abs(amount) > 100_000) return json({ error: 'Enter a whole number of credits.' }, 400);
  const exists = await pool.query(`select 1 from "user" where id = $1`, [userId]);
  if (!exists.rowCount) return json({ error: 'No such user.' }, 404);
  const w = wallet();
  const ref = `admin:${s.user.id}:${Date.now()}:${userId}`;
  const meta = { by: s.user.email, note };
  if (amount > 0) await w.grant({ userId, source: 'promo', amount, expiresAt: days ? new Date(Date.now() + days * 86_400_000) : null, ref, reason: 'promo', meta });
  else await w.adjust({ userId, amount, ref, meta });
  return json({ ok: true, total: (await w.balance(userId)).total });
}
