import { auth } from '@/lib/auth';
import { isCreditError } from '@/lib/credits/errors';
import { wallet } from '@/lib/credits/server';
import { json, sameOrigin } from '@/lib/http';
import { isAdmin } from '@/lib/admin';

export const runtime = 'nodejs';

/* Give back what one paid action was charged. Body: { actionId }. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Bad origin.' }, 403);
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s || !isAdmin(s.user)) return json({ error: 'Not found.' }, 404);
  const body = await req.json().catch(() => ({}));
  const actionId = String(body.actionId ?? '').slice(0, 120);
  if (!actionId) return json({ error: 'Which action?' }, 400);
  try {
    const credits = await wallet().refundAction(actionId, s.user.email);
    return json({ ok: true, credits });
  } catch (e) {
    if (isCreditError(e)) return json({ error: e.message }, 404);
    throw e;
  }
}
