import { json } from '@/lib/http';
import { pickerFor } from '@/lib/connectors/access';
import { connectorRoute } from '@/lib/connectors/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* What the app's file picker needs in this user's browser (its short-lived
   access token, never the refresh token); null when there is none. */
export const GET = connectorRoute<{ name: string }>(async ({ deps, userId }, { name }) => {
  const res = json({ picker: await pickerFor(deps, userId, name) });
  res.headers.set('cache-control', 'no-store');
  return res;
});
