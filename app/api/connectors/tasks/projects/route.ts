import { json } from '@/lib/http';
import { openCapability } from '@/lib/connectors/access';
import { connectorRoute } from '@/lib/connectors/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* The lists of one connected task app (?app=): Todoist projects, Linear teams. */
export const GET = connectorRoute(async ({ req, deps, userId }) => {
  const { api, connector, label } = await openCapability(deps, userId, 'tasks', new URL(req.url).searchParams.get('app'));
  return json({ app: connector, label, listName: api.listName, projects: await api.projects() });
});
