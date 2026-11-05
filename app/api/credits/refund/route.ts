import { auth } from '@/lib/auth';
import { refundSpend } from '@/lib/credits';
import { json, sameOrigin } from '@/lib/http';
import { CREDITS_PER_CLAIM } from '@/lib/pricing';

export const runtime = 'nodejs';

/* Return credits for claims that weren't searched (a stopped or failed trace).
   Body: { spendId, unusedClaims? } — omit unusedClaims to return the whole spend. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Bad origin.' }, 403);
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return json({ error: 'Sign in first.' }, 401);
  const body = await req.json().catch(() => ({}));
  const spendId = String(body.spendId ?? '');
  if (!/^\d+$/.test(spendId)) return json({ error: 'Invalid spend.' }, 400);
  const unused = body.unusedClaims == null ? undefined : Math.max(0, Math.floor(Number(body.unusedClaims))) * CREDITS_PER_CLAIM;
  const balance = await refundSpend(s.user.id, spendId, unused);
  return json({ ok: Boolean(balance), balance });
}
