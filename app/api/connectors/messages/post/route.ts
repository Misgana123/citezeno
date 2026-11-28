import { z } from 'zod';
import { json } from '@/lib/http';
import { openCapability } from '@/lib/connectors/access';
import { connectorRoute } from '@/lib/connectors/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const body = z.object({ channelId: z.string().trim().min(1).max(40), text: z.string().trim().min(1).max(8000) });

/* Post a message to a channel as the user ("Send to Slack" under an answer). */
export const POST = connectorRoute(async (ctx) => {
  const b = await ctx.body(body);
  const { api, label } = await openCapability(ctx.deps, ctx.userId, 'messages');
  const m = await api.post(b.channelId, b.text);
  return json({ app: label, url: m.url }, 201);
});
