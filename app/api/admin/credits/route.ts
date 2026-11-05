import { auth } from '@/lib/auth';
import { adjustPaid } from '@/lib/credits';
import { pool } from '@/lib/db';
import { json, sameOrigin } from '@/lib/http';
import { isAdmin } from '@/lib/admin';

export const runtime = 'nodejs';

/* Grant (positive) or remove (negative) purchased credits. Body: { userId, amount, note }. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Bad origin.' }, 403);
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s || !isAdmin(s.user)) return json({ error: 'Not found.' }, 404);
  const body = await req.json().catch(() => ({}));
  const userId = String(body.userId ?? '');
  const amount = Math.trunc(Number(body.amount));
  const note = String(body.note ?? '').slice(0, 200);
  if (!userId || !Number.isFinite(amount) || !amount || Math.abs(amount) > 100_000) return json({ error: 'Enter a whole number of credits.' }, 400);
  const exists = await pool.query(`select 1 from "user" where id = $1`, [userId]);
  if (!exists.rowCount) return json({ error: 'No such user.' }, 404);
  await adjustPaid(userId, amount, 'adjust', `admin:${s.user.id}:${Date.now()}:${userId}`, { by: s.user.email, note });
  const { rows } = await pool.query<{ free: number; paid: number }>(`select free, paid from credit_balance where "userId" = $1`, [userId]);
  return json({ ok: true, total: rows[0] ? rows[0].free + rows[0].paid : 0 });
}
