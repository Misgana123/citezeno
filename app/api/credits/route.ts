import { auth } from '@/lib/auth';
import { wallet } from '@/lib/credits/server';
import { json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* The signed-in user's balance, plus recent activity with ?history=1. */
export async function GET(req: Request) {
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return json({ error: 'Sign in first.' }, 401);
  const withHistory = new URL(req.url).searchParams.get('history') === '1';
  const w = wallet();
  const [balance, rows] = await Promise.all([w.balance(s.user.id), withHistory ? w.history(s.user.id) : Promise.resolve(undefined)]);
  return json({ balance, history: rows });
}
