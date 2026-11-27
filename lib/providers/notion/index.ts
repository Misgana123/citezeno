import { connectorPolicy, connectorTransport } from '../connectors/http';
import type { ConnectorDefinition } from '../connectors/types';
import { LABEL, notionCall, PROVIDER } from './http';
import { notionOAuth } from './oauth';
import { notionPages } from './pages';

/* Notion, as a public integration (notion.so/my-integrations → New integration
   → Public). Its redirect URI is {site}/api/connectors/notion/callback.

     NOTION_CLIENT_ID / NOTION_CLIENT_SECRET   the integration's OAuth client
     NOTION_RATE_PER_S                          calls per second for all users (default 3, Notion's average limit) */

export const notionConnector: ConnectorDefinition = {
  name: PROVIDER,
  label: LABEL,
  description: 'Send answers, notes and documents to Notion pages, add papers to a Notion database, and let the assistant read the pages you share.',
  services: ['Pages', 'Databases'],
  capabilities: ['pages'],
  create(env, gate) {
    const clientId = env.NOTION_CLIENT_ID?.trim();
    const clientSecret = env.NOTION_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) return null;
    const rate = Number(env.NOTION_RATE_PER_S);
    const transport = gate(connectorTransport({ provider: PROVIDER, label: LABEL }), connectorPolicy({ provider: PROVIDER, label: LABEL, env, ratePerS: Number.isFinite(rate) && rate > 0 ? Math.min(rate, 10) : 3, concurrency: 4 }));
    const oauth = notionOAuth(transport, { clientId, clientSecret });
    return {
      name: PROVIDER,
      auth: { signIn: oauth, apiKey: null },
      open: (c) => ({ pages: notionPages(notionCall(transport, c.accessToken)) }),
      revoke: (c) => oauth.revoke(c),
    };
  },
};
