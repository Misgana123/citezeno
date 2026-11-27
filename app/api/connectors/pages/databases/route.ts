import { json } from '@/lib/http';
import { openCapability } from '@/lib/connectors/access';
import { connectorRoute } from '@/lib/connectors/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* The databases the user shared from their connected notes app (to send papers into). */
export const GET = connectorRoute(async ({ req, deps, userId }) => {
  const q = new URL(req.url).searchParams.get('q')?.slice(0, 200) ?? '';
  const { api, label } = await openCapability(deps, userId, 'pages');
  return json({ app: label, databases: await api.search({ query: q, kind: 'database', limit: 50 }) });
});
