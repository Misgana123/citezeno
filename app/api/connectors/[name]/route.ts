import { z } from 'zod';
import { json } from '@/lib/http';
import { connectWithKey, disconnect } from '@/lib/connectors/connect';
import { definitionOf } from '@/lib/connectors/access';
import { ConnectorError } from '@/lib/connectors/errors';
import { cleanPermissions, PERMISSIONS } from '@/lib/connectors/permissions';
import { connectorRoute } from '@/lib/connectors/route';
import { saveSettings } from '@/lib/connectors/store';

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

const settingsBody = z.object({ assistant: z.boolean().optional(), permissions: z.record(z.string().max(40), z.enum(PERMISSIONS)).optional() });

/* The assistant may use the app or not, and what it may do per kind of action. */
export const PATCH = connectorRoute<{ name: string }>(async (ctx, { name }) => {
  const def = definitionOf(ctx.deps, name);
  const b = await ctx.body(settingsBody);
  const connection = await saveSettings(ctx.deps.db, ctx.userId, name, { assistant: b.assistant, permissions: b.permissions ? cleanPermissions(b.permissions) : undefined });
  if (!connection) throw new ConnectorError('not_connected', `${def.label} isn’t connected.`, name);
  return json({ connection });
});
