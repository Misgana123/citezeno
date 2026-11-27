import 'server-only';
import type { AgentConnectors } from '@/lib/agent/context';
import type { Meter } from '@/lib/providers/gateway/meter';
import { connectedCapabilities, definitionOf, openConnector } from './access';
import { ConnectorError } from './errors';
import { connectorDeps } from './server';

/* The user's connected apps for one assistant reply: which capabilities they
   give (looked up once), and each opened on first use, with this reply's meter. */
export async function agentConnectors(userId: string, meter: Meter): Promise<AgentConnectors | undefined> {
  const d = connectorDeps(meter);
  if (!d.keys) return undefined;
  const caps = await connectedCapabilities(d, userId);
  if (!caps.size) return undefined;
  const connected = new Map([...caps].map(([cap, name]) => [cap, { name, label: definitionOf(d, name).label }]));
  return {
    connected,
    async open(cap) {
      const app = connected.get(cap);
      if (!app) throw new ConnectorError('not_connected', 'No app that can do this is connected. The user can connect one in Account → Connected apps.');
      return { api: await openConnector(d, userId, app.name, cap), connector: app.name, label: app.label };
    },
  };
}
