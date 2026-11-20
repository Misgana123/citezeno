import { auth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { json } from '@/lib/http';
import { allow } from '@/lib/ratelimit';
import { search, SEARCH_TYPES, type SearchType } from '@/lib/search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* The search dialog: ?q=words&type=all|chats|papers|drafts, the signed-in user's own things only. */
export async function GET(req: Request) {
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return json({ error: 'Sign in to search.', code: 'signed_out' }, 401);
  if (!(await allow(`search:${s.user.id}`, 60, 120))) return json({ error: 'Too many searches. Please wait a moment.', code: 'busy' }, 429);
  const params = new URL(req.url).searchParams;
  const raw = params.get('type') ?? 'all';
  const type: SearchType = (SEARCH_TYPES as readonly string[]).includes(raw) ? (raw as SearchType) : 'all';
  return json(await search(pool, s.user.id, params.get('q') ?? '', type));
}
