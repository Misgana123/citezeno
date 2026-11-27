import type { ConnectorTransport } from '../connectors/http';
import { formAnswer, oauth1Header } from '../connectors/oauth';
import { ConnectorAuthError, type ApiKeyAuth, type Credentials, type OAuth1Auth } from '../connectors/types';
import { isProviderError } from '../errors';
import { LABEL, OAUTH, PROVIDER, zoteroCall } from './http';

/* Connecting Zotero: "Sign in with Zotero" (OAuth 1.0a, whose access token is
   an ordinary Zotero API key), or a key the user made and pasted. Either way
   the result is a key: it doesn't expire, so nothing needs refreshing. */

export type KeyInfo = { key?: string; userID?: number; username?: string; displayName?: string; access?: { user?: { library?: boolean; write?: boolean; notes?: boolean }; groups?: Record<string, { library?: boolean; write?: boolean }> } };

/* What a key may do, from Zotero itself. */
export async function keyInfo(transport: ConnectorTransport, key: string): Promise<KeyInfo> {
  try {
    return await zoteroCall(transport, key)<KeyInfo>({ method: 'GET', path: '/keys/current' });
  } catch (e) {
    // an unknown or deleted key: 403 (or 404) from Zotero
    if (isProviderError(e) && (e.code === 'not_found' || e.details.status === 403)) throw new ConnectorAuthError(PROVIDER, `${LABEL} doesn’t know this key.`);
    throw e;
  }
}

export async function keyCredentials(transport: ConnectorTransport, key: string): Promise<Credentials> {
  const info = await keyInfo(transport, key);
  if (!info.userID) throw new ConnectorAuthError(PROVIDER, `${LABEL} doesn’t know this key.`);
  return { accessToken: key, account: { id: String(info.userID), label: info.username || info.displayName || `Zotero user ${info.userID}` }, meta: { userId: info.userID } };
}

export function zoteroApiKey(transport: ConnectorTransport): ApiKeyAuth {
  return { type: 'api-key', helpUrl: 'https://www.zotero.org/settings/keys/new', check: (key) => keyCredentials(transport, key) };
}

export function zoteroOAuth(transport: ConnectorTransport, client: { key: string; secret: string }): OAuth1Auth {
  const signed = (url: string, extra: Record<string, string>, token?: { token: string; secret: string }) =>
    oauth1Header({ method: 'POST', url, consumerKey: client.key, consumerSecret: client.secret, token: token?.token, tokenSecret: token?.secret, extra }).header;
  return {
    type: 'oauth1',
    async begin({ callbackUrl }) {
      const url = `${OAUTH}/request`;
      const text = (await transport.call<string>({ method: 'POST', url, headers: { authorization: signed(url, { oauth_callback: callbackUrl }) }, expect: 'text' })).body;
      const a = formAnswer(text);
      if (!a.oauth_token || !a.oauth_token_secret) throw new ConnectorAuthError(PROVIDER, `${LABEL} didn’t start the sign-in.`);
      // ask for the library, notes and changes (to send papers to it), for the user's groups too
      const authorizeUrl = `${OAUTH}/authorize?${new URLSearchParams({ oauth_token: a.oauth_token, library_access: '1', notes_access: '1', write_access: '1', all_groups: 'write', name: 'Citezeno' })}`;
      return { authorizeUrl, token: a.oauth_token, tokenSecret: a.oauth_token_secret };
    },
    async finish({ token, tokenSecret, verifier }) {
      const url = `${OAUTH}/access`;
      const text = (await transport.call<string>({ method: 'POST', url, headers: { authorization: signed(url, { oauth_verifier: verifier }, { token, secret: tokenSecret }) }, expect: 'text' })).body;
      const a = formAnswer(text);
      // Zotero's access token secret is the new API key
      const key = a.oauth_token_secret;
      if (!key || !a.userID) throw new ConnectorAuthError(PROVIDER, `${LABEL} didn’t finish the sign-in.`);
      return { accessToken: key, account: { id: a.userID, label: a.username || `Zotero user ${a.userID}` }, meta: { userId: Number(a.userID) } };
    },
  };
}

/* Disconnecting deletes the key at Zotero. */
export async function deleteKey(transport: ConnectorTransport, key: string): Promise<void> {
  await zoteroCall(transport, key)({ method: 'DELETE', path: `/keys/${encodeURIComponent(key)}`, expect: 'none' });
}
