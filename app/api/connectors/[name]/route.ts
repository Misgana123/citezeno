import { z } from 'zod';
import { json } from '@/lib/http';
import { connectWithKey, disconnect } from '@/lib/connectors/connect';
import { connectorRoute } from '@/lib/connectors/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const keyBody = z.object({ key: z.string().trim().min(8, 'Paste the whole key.').max(500) });

/* Connect with a pasted key (checked with the app first). */
export const POST = connectorRoute<{ name: string }>(async (ctx, { name }) => {
  const { key } = await ctx.body(keyBody);
  return json({ connection: await connectWithKey(ctx.deps, ctx.userId, name, key) }, 201);
});

/* Disconnect: our access is withdrawn at the app, and the connection forgotten. */
export const DELETE = connectorRoute<{ name: string }>(async (ctx, { name }) => json({ removed: await disconnect(ctx.deps, ctx.userId, name) }));
