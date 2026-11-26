import { auth } from '@/lib/auth';
import { InsufficientCredits } from '@/lib/credits/errors';
import { wallet } from '@/lib/credits/server';
import { holdClaims } from '@/lib/credits/studio';
import { json, sameOrigin } from '@/lib/http';

export const runtime = 'nodejs';

/* Hold credits before a studio search starts. Body: { claims: number, kind: 'trace' | 'cite' }. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Bad origin.' }, 403);
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return json({ error: 'Sign in to trace sources.' }, 401);
  const body = await req.json().catch(() => ({}));
  const claims = Math.floor(Number(body.claims));
  const kind = body.kind === 'cite' ? 'cite' : 'trace';
  if (!Number.isFinite(claims) || claims < 1 || claims > 40) return json({ error: 'Invalid claim count.' }, 400);
  try {
    const { actionId, balance } = await holdClaims(wallet(), s.user.id, claims, kind);
    return json({ actionId, balance });
  } catch (e) {
    if (e instanceof InsufficientCredits) return json({ error: e.message, code: 'INSUFFICIENT_CREDITS', balance: e.balance, needed: e.needed }, 402);
    throw e;
  }
}
