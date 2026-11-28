import type { Capability } from '@/lib/providers/connectors/types';
import { availableConnectors, type ConnectorDeps } from './access';
import { permissionRows, type PermissionRow } from './permissions';
import { listConnections, type Connection } from './store';

/* The Connected apps list: every app that can be connected here, how, and
   this user's connection to it (never a token). */
export type ConnectorView = {
  name: string;
  label: string;
  description: string;
  services: string[];
  /* what it can do in the app: files, documents, sheets, pages, references */
  capabilities: Capability[];
  /* "Sign in with …" is offered */
  signIn: boolean;
  /* a pasted key is offered (the main way when there's no sign-in), and where to make one */
  apiKey: { helpUrl: string } | null;
  connection: Connection | null;
  /* what the assistant may do with it, per kind of action (defaults until connected) */
  permissions: PermissionRow[];
};

export async function connectorCatalog(d: ConnectorDeps, userId: string): Promise<ConnectorView[]> {
  const available = availableConnectors(d);
  if (!available.length) return [];
  const mine = new Map((await listConnections(d.db, userId)).map((c) => [c.connector, c]));
  return available.map(({ def, connector }) => ({
    name: def.name,
    label: def.label,
    description: def.description,
    services: [...def.services],
    capabilities: [...def.capabilities],
    signIn: connector.auth.signIn != null,
    apiKey: connector.auth.apiKey ? { helpUrl: connector.auth.apiKey.helpUrl } : null,
    connection: mine.get(def.name) ?? null,
    permissions: permissionRows(def.capabilities, mine.get(def.name)?.permissions),
  }));
}
