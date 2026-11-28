import type { ConnectorTransport } from '../connectors/http';
import { authorizeUrl, expiresAt, tokenRequest, type OAuth2Client } from '../connectors/oauth';
import type { OAuth2Auth } from '../connectors/types';
import { GRAPH, LABEL, PROVIDER } from './http';

/* Microsoft sign-in (the Microsoft identity platform, OAuth 2 with PKCE) for
   work, school and personal accounts ("common"). Delegated scopes only: the
   app acts as the user. Mail.ReadWrite is for drafts; there is no Mail.Send,
   so nothing is ever sent. Refresh tokens rotate: the newest is kept. */

const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';
export const SCOPES = ['offline_access', 'User.Read', 'Mail.ReadWrite', 'Calendars.ReadWrite', 'Files.ReadWrite'];

type Me = { id?: string; displayName?: string; mail?: string | null; userPrincipalName?: string };

export function microsoftOAuth(transport: ConnectorTransport, client: { clientId: string; clientSecret: string }): OAuth2Auth {
  const c: OAuth2Client = { ...client, tokenUrl: `${AUTHORITY}/token`, provider: PROVIDER, label: LABEL, clientAuth: 'body' };
  const scopesOf = (s: unknown) => (typeof s === 'string' ? s.split(' ').filter(Boolean) : SCOPES);
  return {
    type: 'oauth2',
    authorizeUrl: ({ state, redirectUri, codeChallenge }) =>
      authorizeUrl(`${AUTHORITY}/authorize`, {
        client_id: client.clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        response_mode: 'query',
        scope: SCOPES.join(' '),
        prompt: 'select_account',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      }),
    async exchange({ code, redirectUri, codeVerifier }) {
      const t = await tokenRequest(transport, c, { grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: codeVerifier, scope: SCOPES.join(' ') });
      const me = (await transport.call<Me>({ method: 'GET', url: `${GRAPH}/me`, query: { $select: 'id,displayName,mail,userPrincipalName' }, headers: { authorization: `Bearer ${t.access_token}` } })).body;
      return {
        accessToken: t.access_token!,
        refreshToken: t.refresh_token ?? null,
        expiresAt: expiresAt(t.expires_in),
        scopes: scopesOf(t.scope),
        account: { id: me.id ?? 'microsoft', label: me.mail || me.userPrincipalName || me.displayName || 'Microsoft account' },
      };
    },
    async refresh(cred) {
      const t = await tokenRequest(transport, c, { grant_type: 'refresh_token', refresh_token: cred.refreshToken ?? '', scope: SCOPES.join(' ') });
      return { ...cred, accessToken: t.access_token!, refreshToken: t.refresh_token ?? cred.refreshToken, expiresAt: expiresAt(t.expires_in), scopes: scopesOf(t.scope) };
    },
    // many universities let only their IT approve apps (AADSTS65001 / 90094 / 900941)
    explainDenied: (error, description) =>
      /AADSTS(65001|90094|900941|90095)|admin|consent_required/i.test(`${error} ${description}`)
        ? 'Your organization only lets its IT team approve apps. Ask them to approve Citezeno for Microsoft 365, or connect a personal Microsoft account.'
        : null,
  };
}
