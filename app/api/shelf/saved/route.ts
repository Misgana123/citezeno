import { json } from '@/lib/http';
import { toWorkId } from '@/lib/papers/ids';
import { shelfRoute } from '@/lib/shelf/route';
import { savedMap } from '@/lib/shelf/store/items';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_IDS = 200;

/* Which of these papers (?ids=W1,W2,...) are on the user's shelf: { W1: itemId }. */
export const GET = shelfRoute(async ({ req, db, userId }) => {
  const raw = new URL(req.url).searchParams.get('ids') ?? '';
  const ids = [...new Set(raw.split(',').map((x) => toWorkId(x)).filter((x): x is string => !!x))].slice(0, MAX_IDS);
  return json({ saved: await savedMap(db, userId, ids) });
});
