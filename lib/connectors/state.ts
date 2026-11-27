import { randomBytes } from 'node:crypto';
import { base64url } from '@/lib/providers/connectors/http';
import { safeNext } from '@/lib/safe-next';
import { sign, verify, type ConnectorKeys } from './crypto';

/* The state of one sign-in on its way to an app and back. It travels in a
   short-lived, signed, http-only cookie, tied to the user; the `state`
   parameter sent to the app is its nonce. It also keeps the PKCE verifier
   (OAuth 2) or the request token's secret (OAuth 1.0a), so neither ever
   leaves our server and the browser. */

export const STATE_COOKIE = 'cz_connect';
export const STATE_TTL_MS = 10 * 60 * 1000;

export type SignInState = {
  userId: string;
  connector: string;
  nonce: string;
  /* PKCE code verifier (OAuth 2) */
  verifier?: string;
  /* request token and its secret (OAuth 1.0a) */
  token?: string;
  tokenSecret?: string;
  /* where to send the user afterwards (a path on our site) */
  back: string;
  expires: number;
};

export const newNonce = () => base64url(randomBytes(24));
/* a PKCE code verifier: 43–128 characters */
export const newVerifier = () => base64url(randomBytes(48));

export function packState(s: SignInState, keys: ConnectorKeys): string {
  const data = Buffer.from(JSON.stringify(s)).toString('base64url');
  return `${data}.${sign(data, keys)}`;
}

/* The cookie's state when it is ours, unchanged, unexpired, for this user,
   connector and nonce; otherwise null. */
export function readState(cookie: string | undefined, keys: ConnectorKeys, expect: { userId: string; connector: string; nonce: string | null }, now = Date.now()): SignInState | null {
  if (!cookie) return null;
  const [data, sig] = cookie.split('.');
  if (!data || !sig || !verify(data, sig, keys)) return null;
  try {
    const s = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as SignInState;
    if (s.expires < now || s.userId !== expect.userId || s.connector !== expect.connector) return null;
    if (expect.nonce !== null && s.nonce !== expect.nonce) return null;
    return s;
  } catch {
    return null;
  }
}

/* Only a path on our own site, never another site. */
export const safeBack = (v: string | null | undefined, fallback = '/app/account#apps') => (v && v.length <= 300 ? safeNext(v, fallback) : fallback);
