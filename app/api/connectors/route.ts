import { json } from '@/lib/http';
import { connectorCatalog } from '@/lib/connectors/catalog';
import { connectorRoute } from '@/lib/connectors/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* The apps that can be connected, and this user's connections. */
export const GET = connectorRoute(async ({ deps, userId }) => json({ connectors: await connectorCatalog(deps, userId) }));
