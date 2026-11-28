import { CONNECTORS } from '@/lib/providers/connectors/registry';
import { isConnectorAuthError, type Capabilities, type Capability, type Connector, type ConnectorDefinition, type Credentials } from '@/lib/providers/connectors/types';
import { tx, type Db } from '@/lib/shelf/db';
import type { ConnectorKeys } from './crypto';
import { ConnectorError } from './errors';
import { listConnections, markNeedsReconnect, secretFor, updateCredentials } from './store';

/* Using a connected app for one user: find the connection that gives a
   capability, open its credentials (refreshing an expiring token first, one
   request at a time), and turn a refused token into "connect again". */

export type ConnectorDeps = {
  db: Db;
  /* null when CONNECTORS_SECRET isn't set: connecting apps is off */
  keys: ConnectorKeys | null;
  /* the adapter, wired through the gateway; null when it isn't set up */
  build(name: string): Connector | null;
  registry?: Readonly<Record<string, ConnectorDefinition>>;
  now?: () => number;
};

/* Refresh this long before a token runs out. */
const REFRESH_EARLY_MS = 2 * 60 * 1000;

const registryOf = (d: ConnectorDeps) => d.registry ?? CONNECTORS;

export function definitionOf(d: ConnectorDeps, name: string): ConnectorDefinition {
  const reg = registryOf(d);
  if (!Object.hasOwn(reg, name)) throw new ConnectorError('not_found', 'There is no such app to connect.');
  return reg[name];
}

/* The apps that can be connected here: set up (keys present), in registry order. */
export function availableConnectors(d: ConnectorDeps): { def: ConnectorDefinition; connector: Connector }[] {
  if (!d.keys) return [];
  return Object.values(registryOf(d)).flatMap((def) => {
    const connector = d.build(def.name);
    return connector ? [{ def, connector }] : [];
  });
}

export function requireConnector(d: ConnectorDeps, name: string): { def: ConnectorDefinition; connector: Connector; keys: ConnectorKeys } {
  const def = definitionOf(d, name);
  const connector = d.keys ? d.build(name) : null;
  if (!connector || !d.keys) throw new ConnectorError('not_set_up', `Connecting ${def.label} isn’t set up yet.`, name);
  return { def, connector, keys: d.keys };
}

const expiring = (c: Credentials, now: number) => c.expiresAt != null && c.expiresAt - REFRESH_EARLY_MS <= now;

/* Working credentials for one connection: refreshed when about to expire. */
export async function credentialsFor(d: ConnectorDeps, userId: string, name: string): Promise<Credentials> {
  const { def, connector, keys } = requireConnector(d, name);
  const now = (d.now ?? Date.now)();
  const row = await secretFor(d.db, keys, userId, name);
  if (!row) throw new ConnectorError('not_connected', `${def.label} isn’t connected. Connect it in Settings → Customize → Connectors.`, name);
  if (row.status === 'needs_reconnect' || !row.credentials) {
    if (!row.credentials && row.status === 'ok') await markNeedsReconnect(d.db, userId, name);
    throw new ConnectorError('needs_reconnect', `${def.label} needs to be connected again (Settings → Customize → Connectors).`, name);
  }
  if (!expiring(row.credentials, now)) return row.credentials;

  const signIn = connector.auth.signIn;
  const refresh = signIn?.type === 'oauth2' ? signIn.refresh : undefined;
  if (!refresh || !row.credentials.refreshToken) {
    if (row.credentials.expiresAt! > now) return row.credentials;
    await markNeedsReconnect(d.db, userId, name);
    throw new ConnectorError('needs_reconnect', `${def.label} needs to be connected again (Settings → Customize → Connectors).`, name);
  }
  try {
    return await tx(d.db, async (q) => {
      // the row stays locked until the new token is saved: another request waits, then finds it fresh
      const locked = await secretFor(q, keys, userId, name, { lock: true });
      if (!locked?.credentials) throw new ConnectorError('not_connected', `${def.label} isn’t connected.`, name);
      if (!expiring(locked.credentials, (d.now ?? Date.now)())) return locked.credentials;
      const fresh = await refresh(locked.credentials);
      const kept: Credentials = { ...locked.credentials, ...fresh, refreshToken: fresh.refreshToken || locked.credentials.refreshToken, account: locked.credentials.account, meta: { ...locked.credentials.meta, ...fresh.meta } };
      await updateCredentials(q, keys, userId, name, kept);
      return kept;
    });
  } catch (e) {
    if (isConnectorAuthError(e)) {
      await markNeedsReconnect(d.db, userId, name);
      throw new ConnectorError('needs_reconnect', `${def.label} needs to be connected again (Settings → Customize → Connectors).`, name);
    }
    throw e;
  }
}

/* Calls on a capability: a refused token marks the connection and says so. */
function guarded<T extends object>(api: T, onAuth: () => Promise<never>): T {
  return new Proxy(api, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      if (typeof v !== 'function') return v;
      return async (...args: unknown[]) => {
        try {
          return await v.apply(target, args);
        } catch (e) {
          if (isConnectorAuthError(e)) return onAuth();
          throw e;
        }
      };
    },
  });
}

/* Every connected app that gives each capability, for this user (connections
   that work), in registry order. assistant: only those the user lets the
   assistant use. */
export async function connectedApps(d: ConnectorDeps, userId: string, opts: { assistant?: boolean } = {}): Promise<Map<Capability, string[]>> {
  const out = new Map<Capability, string[]>();
  if (!d.keys) return out;
  const reg = registryOf(d);
  const order = Object.keys(reg);
  const conns = (await listConnections(d.db, userId)).sort((a, b) => order.indexOf(a.connector) - order.indexOf(b.connector));
  for (const c of conns) {
    if (c.status !== 'ok' || (opts.assistant && !c.assistant) || !Object.hasOwn(reg, c.connector) || !d.build(c.connector)) continue;
    for (const cap of reg[c.connector].capabilities) out.set(cap, [...(out.get(cap) ?? []), c.connector]);
  }
  return out;
}

/* The first connected app for each capability. */
export async function connectedCapabilities(d: ConnectorDeps, userId: string, opts: { assistant?: boolean } = {}): Promise<Map<Capability, string>> {
  return new Map([...(await connectedApps(d, userId, opts))].map(([cap, names]) => [cap, names[0]]));
}

/* One capability of one connected app, ready to call. */
export async function openConnector<C extends Capability>(d: ConnectorDeps, userId: string, name: string, cap: C): Promise<Capabilities[C]> {
  const { def, connector } = requireConnector(d, name);
  const credentials = await credentialsFor(d, userId, name);
  const api = connector.open(credentials)[cap];
  if (!api) throw new ConnectorError('bad_request', `${def.label} can’t do this.`, name);
  return guarded(api as Capabilities[C] & object, async () => {
    await markNeedsReconnect(d.db, userId, name);
    throw new ConnectorError('needs_reconnect', `${def.label} needs to be connected again (Settings → Customize → Connectors).`, name);
  });
}

/* Opens a capability for one user: what services take, so the app's routes
   and the assistant (with its own connections) share them. app: which
   connected app, when more than one gives it (default: the first). */
export type CapabilityOpener = <C extends Capability>(cap: C, app?: string | null) => Promise<{ api: Capabilities[C]; connector: string; label: string }>;

export const capabilityOpener =
  (d: ConnectorDeps, userId: string): CapabilityOpener =>
  (cap, app) =>
    openCapability(d, userId, cap, app);

/* The capability from the chosen connected app, or the first that gives it. */
export async function openCapability<C extends Capability>(d: ConnectorDeps, userId: string, cap: C, app?: string | null): Promise<{ api: Capabilities[C]; connector: string; label: string }> {
  const names = (await connectedApps(d, userId)).get(cap) ?? [];
  if (app && !names.includes(app)) {
    const known = Object.hasOwn(registryOf(d), app) ? definitionOf(d, app).label : 'That app';
    throw new ConnectorError('not_connected', `${known} isn’t connected, or can’t do this. Connect it in Settings → Customize → Connectors.`, app);
  }
  const name = app ?? names[0];
  if (!name) throw new ConnectorError('not_connected', `No connected app can do this yet. Connect one in Settings → Customize → Connectors.`);
  return { api: await openConnector(d, userId, name, cap), connector: name, label: definitionOf(d, name).label };
}

/* The app's file picker for this user's connection (a short-lived access
   token for their own browser), or null when the app has none set up. */
export async function pickerFor(d: ConnectorDeps, userId: string, name: string) {
  const { connector } = requireConnector(d, name);
  if (!connector.picker) return null;
  return connector.picker(await credentialsFor(d, userId, name));
}
