import { auth } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { planLimits } from '@/lib/credits/limits';
import { pool } from '@/lib/db';
import { json, sameOrigin } from '@/lib/http';

export const runtime = 'nodejs';

/* Listed at most (the plan decides how many can be saved). */
const LIST_MAX = 2_000;
const MAX_BYTES = 1_500_000;

type Row = {
  id: string; title: string; style: string; mode: string; sources: number; snippet: string; savedAt: Date;
  shareToken: string | null; shareViews: number; shareExpiresAt: Date | null; shareLocked: boolean; titleLocked: boolean;
};

/* List the signed-in user's saved traces (metadata only; open one to get its data). */
export async function GET(req: Request) {
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return json({ error: 'Sign in to see your library.' }, 401);
  const { rows } = await pool.query<Row>(
    `select id, title, style, mode, sources, snippet, "savedAt", "shareToken", "shareViews", "shareExpiresAt", ("sharePassword" is not null) as "shareLocked", "titleLocked"
     from trace where "userId" = $1 order by "savedAt" desc limit $2`,
    [s.user.id, LIST_MAX],
  );
  return json({ items: rows.map((r) => ({ ...r, savedAt: new Date(r.savedAt).getTime(), shareExpiresAt: r.shareExpiresAt ? new Date(r.shareExpiresAt).getTime() : null })) });
}

/* Save (insert or update) one trace. Body: a library entry from lib/library.ts. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Bad origin.' }, 403);
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return json({ error: 'Sign in to save to your account.' }, 401);

  const raw = await req.text();
  if (raw.length > MAX_BYTES) return json({ error: 'This trace is too large to save to your account.' }, 413);
  let e: Record<string, unknown>;
  try {
    e = JSON.parse(raw);
  } catch {
    return json({ error: 'Invalid JSON.' }, 400);
  }
  const id = String(e.id ?? '');
  if (!/^[\w-]{1,64}$/.test(id) || typeof e.result !== 'object' || !e.result) return json({ error: 'Invalid trace.' }, 400);

  const savedAt = typeof e.savedAt === 'number' && Number.isFinite(e.savedAt) ? new Date(Math.min(e.savedAt, Date.now())) : new Date();
  const draft = String(e.draft ?? '');
  const data = { draft, result: e.result };

  // a new trace past the plan's limit isn't saved (updates to saved ones always are); nothing is ever deleted to make room
  const { rows } = await pool.query<{ n: number; exists: boolean }>(
    `select count(*)::int as n, bool_or(id = $2) as exists from trace where "userId" = $1`,
    [s.user.id, id],
  );
  const max = (await planLimits(s.user.id)).savedTraces;
  if (!rows[0].exists && rows[0].n >= max) {
    return json({ error: `You’ve saved ${max.toLocaleString('en-US')} traces, the most your plan keeps. Delete some or upgrade your plan to save more.`, code: 'limit_reached', limit: max }, 403);
  }

  const saved = await pool.query<{ inserted: boolean; title: string }>(
    `insert into trace ("userId", id, title, style, mode, sources, snippet, data, "savedAt")
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     on conflict ("userId", id) do update set title = case when trace."titleLocked" then trace.title else excluded.title end, style = excluded.style, mode = excluded.mode,
       sources = excluded.sources, snippet = excluded.snippet, data = excluded.data, "savedAt" = excluded."savedAt"
     returning (xmax = 0) as inserted, title`,
    [
      s.user.id, id,
      String(e.title ?? 'Untitled').slice(0, 200),
      String(e.style ?? '').slice(0, 40),
      String(e.mode ?? '').slice(0, 40),
      Math.max(0, Math.floor(Number(e.sources) || 0)),
      draft.slice(0, 200),
      JSON.stringify(data),
      savedAt,
    ],
  );
  // first save of a trace = a new entry in the history
  if (saved.rows[0]?.inserted) {
    await logActivity(s.user.id, 'trace.created', {
      traceId: id, title: saved.rows[0].title, meta: { sources: Math.max(0, Math.floor(Number(e.sources) || 0)), style: String(e.style ?? '') },
    });
  }
  return json({ ok: true });
}
