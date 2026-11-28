import { json } from '@/lib/http';
import { openCapability } from '@/lib/connectors/access';
import { connectorRoute } from '@/lib/connectors/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* The user's cloud files in one connected app (?app=), newest first or
   matching ?query=: the file browser for apps without their own picker (OneDrive). */
export const GET = connectorRoute(async ({ req, deps, userId }) => {
  const q = new URL(req.url).searchParams;
  const { api, connector, label } = await openCapability(deps, userId, 'files', q.get('app'));
  const files = await api.list({ query: q.get('query')?.trim().slice(0, 200) || undefined, limit: 50 });
  return json({ app: connector, label, files });
});
