import 'server-only';
import type { AgentConnectors } from '@/lib/agent/context';
import type { Meter } from '@/lib/providers/gateway/meter';
import { connectedCapabilities, definitionOf, openConnector } from './access';
import { ConnectorError } from './errors';
import { permissionOf } from './permissions';
import { connectorDeps } from './server';
import { listConnections } from './store';

/* The user's connected apps for one assistant reply: which capabilities they
   give (looked up once; apps the user switched off for the assistant are left
   out), what the user lets it do with each, and each opened on first use, with
   this reply's meter. */
export async function agentConnectors(userId: string, meter: Meter): Promise<AgentConnectors | undefined> {
  const d = connectorDeps(meter);
  if (!d.keys) return undefined;
  const caps = await connectedCapabilities(d, userId, { assistant: true });
  if (!caps.size) return undefined;
  const saved = new Map((await listConnections(d.db, userId)).map((c) => [c.connector, c.permissions]));
  const connected = new Map([...caps].map(([cap, name]) => [cap, { name, label: definitionOf(d, name).label }]));
  return {
    connected,
    permission: (cap, kind) => permissionOf(saved.get(connected.get(cap)?.name ?? ''), cap, kind),
    async open(cap) {
      const app = connected.get(cap);
      if (!app) throw new ConnectorError('not_connected', 'No app that can do this is connected. The user can connect one in Settings → Customize → Connectors.');
      return { api: await openConnector(d, userId, app.name, cap), connector: app.name, label: app.label };
    },
  };
}
