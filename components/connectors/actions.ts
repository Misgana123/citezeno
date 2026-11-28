'use client';

import type { ConnectorView } from '@/lib/connectors/catalog';
import type { Permission } from '@/lib/connectors/permissions';
import { confirmDialog } from '../confirm';
import { toast } from '../toast';
import { connectHref, connectorFetch } from './api';
import { patchConnector, reloadConnectors } from './useConnectors';

/* What a user does with a connected app, from Settings or the chat's + menu:
   connect (its sign-in page, or a pasted key), switch it on or off for the
   assistant, choose what the assistant may do, disconnect. */

/* The app's sign-in page, coming back to this page with Settings open on Customize. */
export function signInHref(name: string): string {
  const here = typeof window === 'undefined' ? '/app/chat' : window.location.pathname;
  return connectHref(name, `${here}?settings=customize&tab=connectors`);
}

export async function connectWithKey(c: ConnectorView, key: string): Promise<boolean> {
  try {
    await connectorFetch(`/api/connectors/${encodeURIComponent(c.name)}`, { method: 'POST', body: { key } });
    toast(`${c.label} connected`);
    await reloadConnectors();
    return true;
  } catch (e) {
    toast((e as Error).message, true);
    return false;
  }
}

export async function disconnectApp(c: ConnectorView): Promise<boolean> {
  const ok = await confirmDialog({ title: `Disconnect ${c.label}?`, body: `Citezeno and the assistant will no longer reach your ${c.label}. Nothing in ${c.label} or on your shelf is deleted.`, confirmLabel: 'Disconnect', danger: true });
  if (!ok) return false;
  try {
    await connectorFetch(`/api/connectors/${encodeURIComponent(c.name)}`, { method: 'DELETE' });
    toast(`${c.label} disconnected`);
    await reloadConnectors();
    return true;
  } catch (e) {
    toast((e as Error).message, true);
    return false;
  }
}

async function saveSettings(c: ConnectorView, body: { assistant?: boolean; permissions?: Record<string, Permission> }) {
  try {
    await connectorFetch(`/api/connectors/${encodeURIComponent(c.name)}`, { method: 'PATCH', body });
  } catch (e) {
    toast((e as Error).message, true);
  }
  await reloadConnectors();
}

/* The assistant may use the app (shown at once, saved behind). */
export function setAssistant(c: ConnectorView, on: boolean) {
  patchConnector(c.name, (x) => (x.connection ? { ...x, connection: { ...x.connection, assistant: on } } : x));
  return saveSettings(c, { assistant: on });
}

export function setPermission(c: ConnectorView, key: string, value: Permission) {
  patchConnector(c.name, (x) => ({ ...x, permissions: x.permissions.map((p) => (p.key === key ? { ...p, value } : p)) }));
  return saveSettings(c, { permissions: { [key]: value } });
}
