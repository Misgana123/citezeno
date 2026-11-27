import { json } from '@/lib/http';
import { openCapability } from '@/lib/connectors/access';
import { connectorRoute } from '@/lib/connectors/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* The connected reference manager's libraries (the user's own and groups). */
export const GET = connectorRoute(async ({ deps, userId }) => {
  const { api, label, connector } = await openCapability(deps, userId, 'references');
  return json({ app: label, connector, libraries: await api.libraries() });
});
