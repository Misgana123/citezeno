import { connectorPolicy, connectorTransport } from '../connectors/http';
import type { ConnectorDefinition } from '../connectors/types';
import { deleteKey, zoteroApiKey, zoteroOAuth } from './auth';
import { LABEL, PROVIDER, zoteroCall } from './http';
import { zoteroLibrary } from './library';

/* Zotero (Web API v3). Users connect with "Sign in with Zotero" when the app
   is registered (zotero.org/oauth/apps, instant and free; its callback is
   {site}/api/connectors/zotero/callback), or by pasting a key. Without the
   app keys, the pasted key is the only way.

     ZOTERO_CLIENT_KEY / ZOTERO_CLIENT_SECRET   the registered app's client key and secret */

export const zoteroConnector: ConnectorDefinition = {
  name: PROVIDER,
  label: LABEL,
  description: 'Import your Zotero library or a collection into your shelf, keep it up to date with Sync now, and send papers from your shelf to Zotero.',
  services: ['Library', 'Groups'],
  capabilities: ['references'],
  create(env, gate) {
    const transport = gate(connectorTransport({ provider: PROVIDER, label: LABEL }), connectorPolicy({ provider: PROVIDER, label: LABEL, env, concurrency: 4 }));
    const key = env.ZOTERO_CLIENT_KEY?.trim();
    const secret = env.ZOTERO_CLIENT_SECRET?.trim();
    return {
      name: PROVIDER,
      auth: { signIn: key && secret ? zoteroOAuth(transport, { key, secret }) : null, apiKey: zoteroApiKey(transport) },
      open: (c) => ({ references: zoteroLibrary(zoteroCall(transport, c.accessToken), Number(c.meta?.userId ?? c.account.id), c.accessToken) }),
      revoke: (c) => deleteKey(transport, c.accessToken),
    };
  },
};
