import { auth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { describe, loadHistory } from '@/lib/history';
import { json, sameOrigin } from '@/lib/http';

export const runtime = 'nodejs';

/* Download the whole history as CSV. */
export async function GET(req: Request) {
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return json({ error: 'Sign in first.' }, 401);
  const { items } = await loadHistory(s.user.id, { limit: 500 });
  const cell = (v: unknown) => {
    const t = String(v ?? '');
    return /[",\n]|^[=+\-@]/.test(t) ? `"${t.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : t;
  };
  const lines = [['time (UTC)', 'event', 'trace', 'details', 'credits'].join(',')];
  for (const it of items) {
    const d = describe(it);
    lines.push([it.at, d.text, it.title ?? '', d.detail ?? '', it.delta ?? ''].map(cell).join(','));
  }
  return new Response(lines.join('\n') + '\n', {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="citezeno-history-${new Date().toISOString().slice(0, 10)}.csv"`,
      'cache-control': 'no-store',
    },
  });
}

/* Clear the activity log. Credit records are kept: they are the account's balance history. */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Bad origin.' }, 403);
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return json({ error: 'Sign in first.' }, 401);
  const r = await pool.query(`delete from activity where "userId" = $1`, [s.user.id]);
  return json({ ok: true, removed: r.rowCount });
}
