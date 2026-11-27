import type { ConnectorTransport } from '../connectors/http';
import { authorizeUrl, expiresAt, tokenRequest, type OAuth2Client, type OAuth2Token } from '../connectors/oauth';
import type { Credentials, OAuth2Auth } from '../connectors/types';
import { API, LABEL, NOTION_VERSION, PROVIDER } from './http';

/* Notion's public integration sign-in. On Notion's page the user chooses
   which pages and databases Citezeno may see; nothing else is visible. */

type NotionToken = OAuth2Token & { bot_id?: string; workspace_id?: string; workspace_name?: string; owner?: { user?: { id?: string; name?: string; person?: { email?: string } } } };

function credentials(t: NotionToken, prev?: Credentials): Credentials {
  const email = t.owner?.user?.person?.email;
  const workspace = t.workspace_name ?? (prev?.meta?.workspace as string | undefined) ?? 'Notion workspace';
  return {
    accessToken: t.access_token!,
    refreshToken: t.refresh_token ?? prev?.refreshToken ?? null,
    expiresAt: expiresAt(t.expires_in),
    account: prev?.account ?? { id: t.bot_id ?? t.workspace_id ?? 'notion', label: email ? `${workspace} (${email})` : workspace },
    meta: { ...prev?.meta, workspace, workspaceId: t.workspace_id ?? (prev?.meta?.workspaceId as string | undefined) ?? null },
  };
}

export function notionOAuth(transport: ConnectorTransport, client: { clientId: string; clientSecret: string }): OAuth2Auth & { revoke(c: Credentials): Promise<void> } {
  const c: OAuth2Client = { ...client, tokenUrl: `${API}/oauth/token`, provider: PROVIDER, label: LABEL, clientAuth: 'basic' };
  return {
    type: 'oauth2',
    // Notion doesn't use PKCE; the signed state cookie still ties the answer to the user
    authorizeUrl: ({ state, redirectUri }) => authorizeUrl(`${API}/oauth/authorize`, { client_id: client.clientId, response_type: 'code', owner: 'user', redirect_uri: redirectUri, state }),
    async exchange({ code, redirectUri }) {
      return credentials((await tokenRequest(transport, c, { grant_type: 'authorization_code', code, redirect_uri: redirectUri }, 'json')) as NotionToken);
    },
    async refresh(prev) {
      return credentials((await tokenRequest(transport, c, { grant_type: 'refresh_token', refresh_token: prev.refreshToken ?? '' }, 'json')) as NotionToken, prev);
    },
    async revoke(cred) {
      await transport.call({
        method: 'POST',
        url: `${API}/oauth/revoke`,
        headers: { authorization: `Basic ${Buffer.from(`${client.clientId}:${client.clientSecret}`).toString('base64')}`, 'notion-version': NOTION_VERSION },
        json: { token: cred.accessToken },
        expect: 'none',
      });
    },
  };
}
