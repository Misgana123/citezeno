import { createHash } from 'node:crypto';
import { isProviderError } from '@/lib/providers/errors';
import { base64url } from '@/lib/providers/connectors/http';
import { isConnectorAuthError, type Credentials } from '@/lib/providers/connectors/types';
import { definitionOf, requireConnector, type ConnectorDeps } from './access';
import { ConnectorError } from './errors';
import { newNonce, newVerifier, packState, readState, STATE_TTL_MS } from './state';
import { deleteConnection, saveConnection, secretFor, type Connection } from './store';

/* Connecting and disconnecting, the same for every app: one OAuth 2 flow,
   one OAuth 1.0a flow and one pasted-key flow drive every connector in the
   registry. Each adapter only supplies its own addresses and token handling. */

/* Where an app sends the user back: the same for every connector. */
export const callbackUrl = (origin: string, name: string) => `${origin}/api/connectors/${encodeURIComponent(name)}/callback`;

export type Begun = { redirect: string; cookie: string };

export async function beginSignIn(d: ConnectorDeps, userId: string, name: string, opts: { origin: string; back: string }): Promise<Begun> {
  const { def, connector, keys } = requireConnector(d, name);
  const signIn = connector.auth.signIn;
  if (!signIn) throw new ConnectorError('bad_request', `${def.label} connects with a key, not a sign-in.`, name);
  const expires = (d.now ?? Date.now)() + STATE_TTL_MS;
  const redirectUri = callbackUrl(opts.origin, name);
  if (signIn.type === 'oauth2') {
    const nonce = newNonce();
    const verifier = newVerifier();
    const codeChallenge = base64url(createHash('sha256').update(verifier).digest());
    return { redirect: signIn.authorizeUrl({ state: nonce, redirectUri, codeChallenge }), cookie: packState({ userId, connector: name, nonce, verifier, back: opts.back, expires }, keys) };
  }
  const r = await signIn.begin({ callbackUrl: redirectUri });
  // the request token comes back with the user, so it is the nonce
  return { redirect: r.authorizeUrl, cookie: packState({ userId, connector: name, nonce: r.token, token: r.token, tokenSecret: r.tokenSecret, back: opts.back, expires }, keys) };
}

/* The app sent the user back: check the state, trade the code for tokens, keep them. */
export async function finishSignIn(d: ConnectorDeps, userId: string, name: string, opts: { origin: string; params: URLSearchParams; cookie: string | undefined }): Promise<{ back: string; connection: Connection }> {
  const { def, connector, keys } = requireConnector(d, name);
  const signIn = connector.auth.signIn;
  if (!signIn) throw new ConnectorError('bad_request', `${def.label} connects with a key, not a sign-in.`, name);
  const p = opts.params;
  if (p.get('error') || p.get('denied')) throw new ConnectorError('denied', `${def.label} wasn’t connected: access wasn’t allowed.`, name);
  const nonce = signIn.type === 'oauth2' ? p.get('state') : p.get('oauth_token');
  const state = nonce ? readState(opts.cookie, keys, { userId, connector: name, nonce }, (d.now ?? Date.now)()) : null;
  if (!state) throw new ConnectorError('bad_request', 'This sign-in link expired or was already used. Please try connecting again.', name);

  let credentials: Credentials;
  try {
    if (signIn.type === 'oauth2') {
      const code = p.get('code');
      if (!code || !state.verifier) throw new ConnectorError('bad_request', `${def.label} didn’t finish the sign-in. Please try again.`, name);
      credentials = await signIn.exchange({ code, redirectUri: callbackUrl(opts.origin, name), codeVerifier: state.verifier });
    } else {
      const verifier = p.get('oauth_verifier');
      if (!verifier || !state.token || !state.tokenSecret) throw new ConnectorError('bad_request', `${def.label} didn’t finish the sign-in. Please try again.`, name);
      credentials = await signIn.finish({ token: state.token, tokenSecret: state.tokenSecret, verifier });
    }
  } catch (e) {
    if (isConnectorAuthError(e)) throw new ConnectorError('denied', `${def.label} refused the sign-in. Please try again.`, name);
    throw e;
  }
  return { back: state.back, connection: await saveConnection(d.db, keys, userId, name, credentials) };
}

/* A key the user pasted: checked with the app before it is kept. */
export async function connectWithKey(d: ConnectorDeps, userId: string, name: string, key: string): Promise<Connection> {
  const { def, connector, keys } = requireConnector(d, name);
  if (!connector.auth.apiKey) throw new ConnectorError('bad_request', `${def.label} connects with a sign-in, not a key.`, name);
  let credentials: Credentials;
  try {
    credentials = await connector.auth.apiKey.check(key.trim());
  } catch (e) {
    if (isConnectorAuthError(e) || (isProviderError(e) && (e.code === 'not_found' || e.code === 'bad_request'))) throw new ConnectorError('denied', `${def.label} didn’t accept this key. Check it and try again.`, name);
    throw e;
  }
  return saveConnection(d.db, keys, userId, name, credentials);
}

/* Withdraw our access at the app (best effort), then forget the connection. */
export async function disconnect(d: ConnectorDeps, userId: string, name: string): Promise<boolean> {
  definitionOf(d, name);
  const connector = d.keys ? d.build(name) : null;
  // no longer set up here: nothing to withdraw with, the connection is still forgotten
  if (!connector || !d.keys) return deleteConnection(d.db, userId, name);
  const keys = d.keys;
  const row = await secretFor(d.db, keys, userId, name);
  if (row?.credentials && connector.revoke) {
    await connector.revoke(row.credentials).catch((e) => console.warn(`[citezeno] connectors: revoking ${name} failed`, (e as Error).message));
  }
  return deleteConnection(d.db, userId, name);
}
