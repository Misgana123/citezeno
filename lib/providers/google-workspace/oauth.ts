import type { ConnectorTransport } from '../connectors/http';
import { authorizeUrl, expiresAt, tokenRequest, type OAuth2Client } from '../connectors/oauth';
import type { Credentials, OAuth2Auth } from '../connectors/types';
import { DRIVE, LABEL, PROVIDER } from './http';

/* Google sign-in for Drive, Docs and Sheets. Only `drive.file`: the files the
   user picks (Google Picker) and the files Citezeno makes. Google treats it as
   non-sensitive, so no security assessment is needed. This consent is asked
   separately from signing in to Citezeno with Google. */

const AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const REVOKE = 'https://oauth2.googleapis.com/revoke';
export const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

type About = { user?: { displayName?: string; emailAddress?: string; permissionId?: string } };

export function googleOAuth(transport: ConnectorTransport, client: { clientId: string; clientSecret: string }): OAuth2Auth & { revoke(c: Credentials): Promise<void> } {
  const c: OAuth2Client = { ...client, tokenUrl: TOKEN, provider: PROVIDER, label: LABEL, clientAuth: 'body' };
  const scopesOf = (s: unknown) => (typeof s === 'string' ? s.split(' ').filter(Boolean) : SCOPES);
  return {
    type: 'oauth2',
    authorizeUrl: ({ state, redirectUri, codeChallenge }) =>
      authorizeUrl(AUTHORIZE, {
        client_id: client.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPES.join(' '),
        access_type: 'offline',
        prompt: 'consent',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      }),
    async exchange({ code, redirectUri, codeVerifier }) {
      const t = await tokenRequest(transport, c, { grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: codeVerifier });
      // who connected: Drive's own "about" works with drive.file, so no extra scope is asked for
      const about = (await transport.call<About>({ method: 'GET', url: `${DRIVE}/about`, query: { fields: 'user(displayName,emailAddress,permissionId)' }, headers: { authorization: `Bearer ${t.access_token}` } })).body;
      return {
        accessToken: t.access_token!,
        refreshToken: t.refresh_token ?? null,
        expiresAt: expiresAt(t.expires_in),
        scopes: scopesOf(t.scope),
        account: { id: about.user?.permissionId ?? about.user?.emailAddress ?? 'google', label: about.user?.emailAddress ?? about.user?.displayName ?? 'Google account' },
      };
    },
    async refresh(cred) {
      const t = await tokenRequest(transport, c, { grant_type: 'refresh_token', refresh_token: cred.refreshToken ?? '' });
      return { ...cred, accessToken: t.access_token!, refreshToken: t.refresh_token ?? cred.refreshToken, expiresAt: expiresAt(t.expires_in), scopes: scopesOf(t.scope) };
    },
    async revoke(cred) {
      await transport.call({ method: 'POST', url: REVOKE, form: { token: cred.refreshToken || cred.accessToken }, expect: 'none' });
    },
  };
}
