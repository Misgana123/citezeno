import 'server-only';
import type { AgentConnectors } from '@/lib/agent/context';
import type { Meter } from '@/lib/providers/gateway/meter';
import type { Capability } from '@/lib/providers/connectors/types';
import { connectedApps, definitionOf, openConnector } from './access';
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
  const byCap = await connectedApps(d, userId, { assistant: true });
  if (!byCap.size) return undefined;
  const saved = new Map((await listConnections(d.db, userId)).map((c) => [c.connector, c.permissions]));
  const apps = new Map([...byCap].map(([cap, names]) => [cap, names.map((name) => ({ name, label: definitionOf(d, name).label }))]));
  const connected = new Map([...apps].map(([cap, list]) => [cap, list[0]]));
  const permOf = (cap: Capability, kind: 'read' | 'write', name: string) => permissionOf(saved.get(name), cap, kind);
  const pick = (cap: Capability, kind: 'read' | 'write', app?: string | null) => {
    const list = apps.get(cap) ?? [];
    if (app) return list.find((a) => a.name === app) ?? null;
    return list.find((a) => permOf(cap, kind, a.name) !== 'never') ?? list[0] ?? null;
  };
  return {
    connected,
    apps,
    pick,
    permission(cap, kind, app) {
      const chosen = pick(cap, kind, app);
      return chosen ? permOf(cap, kind, chosen.name) : 'never';
    },
    async open(cap, app) {
      const chosen = app ? apps.get(cap)?.find((a) => a.name === app) : connected.get(cap);
      if (!chosen) {
        const names = apps.get(cap)?.map((a) => a.name).join(', ');
        throw new ConnectorError('not_connected', app && names ? `“${app}” isn’t connected for this. Use one of: ${names}.` : 'No app that can do this is connected. The user can connect one in Settings → Customize → Connectors.');
      }
      return { api: await openConnector(d, userId, chosen.name, cap), connector: chosen.name, label: chosen.label };
    },
  };
}
