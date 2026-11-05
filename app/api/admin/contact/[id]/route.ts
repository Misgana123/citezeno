import { auth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { pool } from '@/lib/db';
import { json, sameOrigin } from '@/lib/http';

export const runtime = 'nodejs';

/* Mark a contact message handled or not. Body: { handled: boolean }. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return json({ error: 'Bad origin.' }, 403);
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s || !isAdmin(s.user)) return json({ error: 'Not found.' }, 404);
  const { id } = await params;
  if (!/^\d+$/.test(id)) return json({ error: 'Invalid id.' }, 400);
  const body = await req.json().catch(() => ({}));
  await pool.query(`update contact_message set handled = $2 where id = $1`, [id, Boolean(body.handled)]);
  return json({ ok: true });
}
