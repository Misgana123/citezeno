import { z } from 'zod';
import { json } from '@/lib/http';
import { openCapability } from '@/lib/connectors/access';
import { ConnectorError } from '@/lib/connectors/errors';
import { connectorRoute } from '@/lib/connectors/route';
import { syncScope } from '@/lib/connectors/service/import-references';
import { getSync } from '@/lib/connectors/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIBRARY = z.string().regex(/^(user|group:\d{1,12})$/);

/* A library's collections, and when each (and the whole library) was last synced. */
export const GET = connectorRoute(async ({ req, deps, userId }) => {
  const library = LIBRARY.safeParse(new URL(req.url).searchParams.get('library'));
  if (!library.success) throw new ConnectorError('bad_request', 'Choose a library.');
  const { api, connector } = await openCapability(deps, userId, 'references');
  const collections = await api.collections(library.data);
  const synced: Record<string, string | null> = {};
  for (const key of ['*', ...collections.map((c) => c.key)]) {
    const s = await getSync(deps.db, userId, connector, syncScope(library.data, key === '*' ? null : key));
    if (s?.syncedAt) synced[key] = s.syncedAt;
  }
  return json({ collections, synced });
});
