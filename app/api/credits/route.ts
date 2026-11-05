import { auth } from '@/lib/auth';
import { getBalance, history } from '@/lib/credits';
import { json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* The signed-in user's balance, plus recent activity with ?history=1. */
export async function GET(req: Request) {
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return json({ error: 'Sign in first.' }, 401);
  const withHistory = new URL(req.url).searchParams.get('history') === '1';
  const [balance, rows] = await Promise.all([getBalance(s.user.id), withHistory ? history(s.user.id) : Promise.resolve(undefined)]);
  return json({ balance, history: rows });
}
