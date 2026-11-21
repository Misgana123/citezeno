import { pool } from '@/lib/db';
import { AGENT_FILE_LINK_TTL_S, getAgentFile } from '@/lib/agent/files';
import { AgentHttpError, agentRoute } from '@/lib/agent/server';
import { fileStorage } from '@/lib/providers/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type P = { id: string };

/* A file the assistant made: a redirect to a link that works for five minutes,
   for its owner only. ?inline=1 shows it in the browser (an image preview). */
export const GET = agentRoute<P>(async (req, userId, { id }) => {
  const file = await getAgentFile(pool, userId, id);
  if (!file) throw new AgentHttpError(404, 'That file no longer exists.', 'not_found');
  const store = fileStorage();
  if (!store) throw new AgentHttpError(503, 'File downloads aren’t set up yet.', 'unavailable');
  const inline = new URL(req.url).searchParams.get('inline') === '1';
  return new Response(null, { status: 302, headers: { location: store.downloadUrl(file.storageKey, { ttlS: AGENT_FILE_LINK_TTL_S, fileName: file.name, inline }), 'cache-control': 'no-store' } });
});
