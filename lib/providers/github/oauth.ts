import type { ConnectorTransport } from '../connectors/http';
import { authorizeUrl, expiresAt, tokenRequest, type OAuth2Client } from '../connectors/oauth';
import type { Credentials, OAuth2Auth } from '../connectors/types';
import { API, LABEL, PROVIDER } from './http';

/* Signing in to the Citezeno GitHub App as the user (user-to-server tokens).
   What the token reaches is what the user's account can see AND what the app
   is installed on: the user picks those repositories when installing the app.
   Tokens last 8 hours and refresh (the refresh token rotates). */

const AUTHORIZE = 'https://github.com/login/oauth/authorize';
const TOKEN = 'https://github.com/login/oauth/access_token';

export function githubOAuth(transport: ConnectorTransport, client: { clientId: string; clientSecret: string }): OAuth2Auth & { revoke(c: Credentials): Promise<void> } {
  const c: OAuth2Client = { ...client, tokenUrl: TOKEN, provider: PROVIDER, label: LABEL, clientAuth: 'body' };
  return {
    type: 'oauth2',
    authorizeUrl: ({ state, redirectUri, codeChallenge }) => authorizeUrl(AUTHORIZE, { client_id: client.clientId, redirect_uri: redirectUri, state, code_challenge: codeChallenge, code_challenge_method: 'S256' }),
    async exchange({ code, redirectUri, codeVerifier }) {
      const t = await tokenRequest(transport, c, { code, redirect_uri: redirectUri, code_verifier: codeVerifier });
      const me = (await transport.call<{ id?: number; login?: string }>({ method: 'GET', url: `${API}/user`, headers: { authorization: `Bearer ${t.access_token}`, accept: 'application/vnd.github+json' } })).body;
      return { accessToken: t.access_token!, refreshToken: t.refresh_token ?? null, expiresAt: expiresAt(t.expires_in), account: { id: String(me.id ?? me.login ?? 'github'), label: me.login ?? 'GitHub account' } };
    },
    async refresh(cred) {
      const t = await tokenRequest(transport, c, { grant_type: 'refresh_token', refresh_token: cred.refreshToken ?? '' });
      return { ...cred, accessToken: t.access_token!, refreshToken: t.refresh_token ?? cred.refreshToken, expiresAt: expiresAt(t.expires_in) };
    },
    // withdraws the user's authorization of the app (all its tokens)
    async revoke(cred) {
      await transport.call({ method: 'DELETE', url: `${API}/applications/${client.clientId}/grant`, headers: { authorization: `Basic ${Buffer.from(`${client.clientId}:${client.clientSecret}`).toString('base64')}`, accept: 'application/vnd.github+json' }, json: { access_token: cred.accessToken }, expect: 'none' });
    },
  };
}
