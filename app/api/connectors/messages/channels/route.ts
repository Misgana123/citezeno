import { json } from '@/lib/http';
import { openCapability } from '@/lib/connectors/access';
import { connectorRoute } from '@/lib/connectors/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* The user's chat channels (Slack), the ones they're in: where "Send to Slack" can post. */
export const GET = connectorRoute(async ({ req, deps, userId }) => {
  const { api, label } = await openCapability(deps, userId, 'messages');
  const query = new URL(req.url).searchParams.get('query')?.slice(0, 80) || undefined;
  const channels = (await api.channels({ query, limit: 100 })).filter((c) => c.member);
  return json({ app: label, channels });
});
