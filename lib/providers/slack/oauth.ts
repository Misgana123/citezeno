import { ProviderError, isProviderError } from '../errors';
import type { ConnectorTransport } from '../connectors/http';
import { authorizeUrl } from '../connectors/oauth';
import { ConnectorAuthError, type Credentials, type OAuth2Auth } from '../connectors/types';
import { API, LABEL, PROVIDER } from './http';

/* Signing in to Slack as the user (a user token, no bot): Citezeno searches,
   reads and posts as that person, only where they can already. */

const AUTHORIZE = 'https://slack.com/oauth/v2/authorize';
export const USER_SCOPES = ['search:read', 'channels:read', 'groups:read', 'channels:history', 'groups:history', 'users:read', 'chat:write'];

type Access = { ok: boolean; error?: string; authed_user?: { id?: string; access_token?: string; refresh_token?: string; expires_in?: number; scope?: string }; team?: { id?: string; name?: string } };

export function slackOAuth(transport: ConnectorTransport, client: { clientId: string; clientSecret: string }): OAuth2Auth & { revoke(c: Credentials): Promise<void> } {
  const access = async (form: Record<string, string>) => {
    let r: Access;
    try {
      r = (await transport.call<Access>({ method: 'POST', url: `${API}/oauth.v2.access`, form: { client_id: client.clientId, client_secret: client.clientSecret, ...form } })).body;
    } catch (e) {
      if (isProviderError(e) && e.code === 'bad_request') throw new ConnectorAuthError(PROVIDER, `${LABEL} refused the sign-in.`);
      throw e;
    }
    if (!r.ok || !r.authed_user?.access_token) {
      if (/invalid_code|code_already_used|invalid_refresh_token|invalid_grant/.test(r.error ?? '')) throw new ConnectorAuthError(PROVIDER, `${LABEL} no longer accepts this connection.`);
      throw new ProviderError('bad_request', `${LABEL} didn’t finish the sign-in (${r.error ?? 'no token'}).`, { provider: PROVIDER });
    }
    return r;
  };
  return {
    type: 'oauth2',
    authorizeUrl: ({ state, redirectUri }) => authorizeUrl(AUTHORIZE, { client_id: client.clientId, user_scope: USER_SCOPES.join(','), redirect_uri: redirectUri, state }),
    async exchange({ code, redirectUri }) {
      const r = await access({ code, redirect_uri: redirectUri });
      const u = r.authed_user!;
      // the workspace's address, for links to messages
      const who = (await transport.call<{ ok: boolean; url?: string; user?: string; team?: string }>({ method: 'GET', url: `${API}/auth.test`, headers: { authorization: `Bearer ${u.access_token}` } })).body;
      return {
        accessToken: u.access_token!,
        refreshToken: u.refresh_token ?? null,
        expiresAt: u.expires_in ? Date.now() + (u.expires_in - 60) * 1000 : null,
        scopes: (u.scope ?? '').split(',').filter(Boolean),
        account: { id: `${r.team?.id ?? 'team'}:${u.id ?? 'user'}`, label: `${who.user ?? 'you'} · ${r.team?.name ?? who.team ?? 'Slack'}` },
        meta: { teamUrl: who.url ?? null, userId: u.id ?? null },
      };
    },
    // only when the workspace turned on token rotation
    async refresh(cred) {
      const r = await access({ grant_type: 'refresh_token', refresh_token: cred.refreshToken ?? '' });
      const u = r.authed_user!;
      return { ...cred, accessToken: u.access_token!, refreshToken: u.refresh_token ?? cred.refreshToken, expiresAt: u.expires_in ? Date.now() + (u.expires_in - 60) * 1000 : null };
    },
    async revoke(cred) {
      await transport.call({ method: 'GET', url: `${API}/auth.revoke`, headers: { authorization: `Bearer ${cred.accessToken}` } });
    },
  };
}
