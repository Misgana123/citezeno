import { auth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { json, sameOrigin } from '@/lib/http';

export const runtime = 'nodejs';

const MAX_TRACES = 200;
const MAX_BYTES = 1_500_000;

type Row = { id: string; title: string; style: string; mode: string; sources: number; snippet: string; savedAt: Date; shareToken: string | null; shareViews: number };

/* List the signed-in user's saved traces (metadata only; open one to get its data). */
export async function GET(req: Request) {
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return json({ error: 'Sign in to see your library.' }, 401);
  const { rows } = await pool.query<Row>(
    `select id, title, style, mode, sources, snippet, "savedAt", "shareToken", "shareViews" from trace where "userId" = $1 order by "savedAt" desc limit $2`,
    [s.user.id, MAX_TRACES],
  );
  return json({ items: rows.map((r) => ({ ...r, savedAt: new Date(r.savedAt).getTime() })) });
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

  const { rows } = await pool.query<{ n: string }>(`select count(*) as n from trace where "userId" = $1 and id <> $2`, [s.user.id, id]);
  if (Number(rows[0].n) >= MAX_TRACES) {
    // keep the newest: drop the oldest entry to make room
    await pool.query(
      `delete from trace where ("userId", id) in (select "userId", id from trace where "userId" = $1 and id <> $2 order by "savedAt" asc limit 1)`,
      [s.user.id, id],
    );
  }

  await pool.query(
    `insert into trace ("userId", id, title, style, mode, sources, snippet, data, "savedAt")
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     on conflict ("userId", id) do update set title = case when trace."titleLocked" then trace.title else excluded.title end, style = excluded.style, mode = excluded.mode,
       sources = excluded.sources, snippet = excluded.snippet, data = excluded.data, "savedAt" = excluded."savedAt"`,
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
  return json({ ok: true });
}
