import { auth } from '@/lib/auth';
import { isCreditError } from '@/lib/credits/errors';
import { wallet } from '@/lib/credits/server';
import { settleClaims } from '@/lib/credits/studio';
import { pool } from '@/lib/db';
import { json, sameOrigin } from '@/lib/http';

export const runtime = 'nodejs';

/* Finish a studio search: charge the claims it searched, release the rest.
   Body: { actionId, searched } (searched: 0 when it stopped or found nothing). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Bad origin.' }, 403);
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return json({ error: 'Sign in first.' }, 401);
  const body = await req.json().catch(() => ({}));
  const actionId = String(body.actionId ?? '');
  const searched = Number(body.searched);
  if (!/^[0-9a-f-]{36}$/.test(actionId) || !Number.isFinite(searched)) return json({ error: 'Invalid request.' }, 400);
  try {
    const r = await settleClaims(pool, wallet(), s.user.id, actionId, searched);
    return json({ ok: true, charged: r.charged, balance: r.balance });
  } catch (e) {
    if (isCreditError(e)) return json({ ok: false, error: e.message }, 404);
    throw e;
  }
}
