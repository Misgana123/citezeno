import type { ConnectorTransport } from '../connectors/http';
import { authorizeUrl, expiresAt, tokenRequest, type OAuth2Client } from '../connectors/oauth';
import type { Credentials, OAuth2Auth } from '../connectors/types';
import { DRIVE, LABEL, PROVIDER } from './http';

/* Google sign-in for Google's apps. Drive, Docs and Sheets ask only for
   `drive.file`: the files the user picks (Google Picker) and the files
   Citezeno makes. Google treats it as non-sensitive, so no security
   assessment is needed. Google Calendar has its own sign-in with its own
   scopes (lib/providers/google-calendar). Each consent is asked separately
   from signing in to Citezeno with Google. */

const AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const REVOKE = 'https://oauth2.googleapis.com/revoke';
export const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

type About = { user?: { displayName?: string; emailAddress?: string; permissionId?: string } };

/* Who connected, from the new access token (each Google app asks its own API). */
export type GoogleAccount = (accessToken: string) => Promise<{ id: string; label: string }>;

const driveAccount =
  (transport: ConnectorTransport): GoogleAccount =>
  async (token) => {
    // Drive's own "about" works with drive.file, so no extra scope is asked for
    const about = (await transport.call<About>({ method: 'GET', url: `${DRIVE}/about`, query: { fields: 'user(displayName,emailAddress,permissionId)' }, headers: { authorization: `Bearer ${token}` } })).body;
    return { id: about.user?.permissionId ?? about.user?.emailAddress ?? 'google', label: about.user?.emailAddress ?? about.user?.displayName ?? 'Google account' };
  };

/* Google's OAuth 2 with PKCE, for one Google app: its scopes, its provider name, how it names the account. */
export function googleOAuth(
  transport: ConnectorTransport,
  client: { clientId: string; clientSecret: string },
  app: { scopes: readonly string[]; provider: string; label: string; account: GoogleAccount } = { scopes: SCOPES, provider: PROVIDER, label: LABEL, account: driveAccount(transport) },
): OAuth2Auth & { revoke(c: Credentials): Promise<void> } {
  const c: OAuth2Client = { ...client, tokenUrl: TOKEN, provider: app.provider, label: app.label, clientAuth: 'body' };
  const scopesOf = (s: unknown) => (typeof s === 'string' ? s.split(' ').filter(Boolean) : [...app.scopes]);
  return {
    type: 'oauth2',
    authorizeUrl: ({ state, redirectUri, codeChallenge }) =>
      authorizeUrl(AUTHORIZE, {
        client_id: client.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: app.scopes.join(' '),
        access_type: 'offline',
        prompt: 'consent',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      }),
    async exchange({ code, redirectUri, codeVerifier }) {
      const t = await tokenRequest(transport, c, { grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: codeVerifier });
      return {
        accessToken: t.access_token!,
        refreshToken: t.refresh_token ?? null,
        expiresAt: expiresAt(t.expires_in),
        scopes: scopesOf(t.scope),
        account: await app.account(t.access_token!),
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
