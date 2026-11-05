import { auth } from '@/lib/auth';
import { InsufficientCredits, spend } from '@/lib/credits';
import { json, sameOrigin } from '@/lib/http';
import { CREDITS_PER_CLAIM } from '@/lib/pricing';

export const runtime = 'nodejs';

/* Reserve credits before a search starts. Body: { claims: number, kind: 'trace' | 'cite' }. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Bad origin.' }, 403);
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return json({ error: 'Sign in to trace sources.' }, 401);
  const body = await req.json().catch(() => ({}));
  const claims = Math.floor(Number(body.claims));
  const kind = body.kind === 'cite' ? 'cite' : 'trace';
  if (!Number.isFinite(claims) || claims < 1 || claims > 40) return json({ error: 'Invalid claim count.' }, 400);
  try {
    const { spendId, balance } = await spend(s.user.id, claims * CREDITS_PER_CLAIM, kind, { claims });
    return json({ spendId, balance });
  } catch (e) {
    if (e instanceof InsufficientCredits) return json({ error: e.message, code: 'INSUFFICIENT_CREDITS', balance: e.balance, needed: e.needed }, 402);
    throw e;
  }
}
