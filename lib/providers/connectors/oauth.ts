import { createHmac, randomBytes } from 'node:crypto';
import { isProviderError } from '../errors';
import type { ConnectorTransport } from './http';
import { ConnectorAuthError } from './types';

/* The two OAuth flavours connectors use, without any vendor in them: the
   adapter gives its own addresses and keys. */

/* ---------- OAuth 2 ---------- */

export type OAuth2Client = { clientId: string; clientSecret: string; tokenUrl: string; provider: string; label: string; /* how the client proves itself at the token endpoint */ clientAuth: 'body' | 'basic' };

/* What token endpoints answer (each vendor adds its own fields). */
export type OAuth2Token = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; token_type?: string } & Record<string, unknown>;

export function authorizeUrl(base: string, params: Record<string, string>): string {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

/* POST to the token endpoint. A refused grant (revoked, expired) means the user must connect again. */
export async function tokenRequest(transport: ConnectorTransport, c: OAuth2Client, form: Record<string, string>, as: 'form' | 'json' = 'form'): Promise<OAuth2Token> {
  const headers: Record<string, string> = {};
  const body = { ...form };
  if (c.clientAuth === 'basic') headers.authorization = `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64')}`;
  else Object.assign(body, { client_id: c.clientId, client_secret: c.clientSecret });
  try {
    const { body: token } = await transport.call<OAuth2Token>({ method: 'POST', url: c.tokenUrl, headers, ...(as === 'json' ? { json: body } : { form: body }) });
    if (!token.access_token) throw new ConnectorAuthError(c.provider, `${c.label} didn’t send an access token.`);
    return token;
  } catch (e) {
    if (isProviderError(e) && e.code === 'bad_request' && /invalid_grant|invalid_client|unauthorized_client|expired|revoked/i.test(e.details.reason ?? e.message)) {
      throw new ConnectorAuthError(c.provider, `${c.label} no longer accepts this connection.`);
    }
    throw e;
  }
}

/* expires_in seconds → epoch ms, a minute early so a token is never used at its last second. */
export const expiresAt = (expiresIn: unknown, now = Date.now()): number | null => (typeof expiresIn === 'number' && expiresIn > 0 ? now + (expiresIn - 60) * 1000 : null);

/* ---------- OAuth 1.0a (HMAC-SHA1) ---------- */

/* RFC 3986 encoding, as OAuth 1.0a signs. */
export const rfc3986 = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);

export type OAuth1Sign = {
  method: 'GET' | 'POST';
  url: string;
  consumerKey: string;
  consumerSecret: string;
  token?: string;
  tokenSecret?: string;
  /* oauth_callback or oauth_verifier */
  extra?: Record<string, string>;
  /* query or form parameters that are part of the signature */
  params?: Record<string, string>;
  nonce?: string;
  timestamp?: number;
};

/* The signature base string and the Authorization header for one request. */
export function oauth1Header(s: OAuth1Sign): { header: string; base: string } {
  const oauth: Record<string, string> = {
    oauth_consumer_key: s.consumerKey,
    oauth_nonce: s.nonce ?? randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(s.timestamp ?? Math.floor(Date.now() / 1000)),
    oauth_version: '1.0',
    ...(s.token ? { oauth_token: s.token } : {}),
    ...s.extra,
  };
  const u = new URL(s.url);
  const all: [string, string][] = [...Object.entries(oauth), ...Object.entries(s.params ?? {}), ...[...u.searchParams.entries()]];
  const normalized = all
    .map(([k, v]) => [rfc3986(k), rfc3986(v)] as const)
    .sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const baseUrl = `${u.protocol}//${u.host}${u.pathname}`;
  const base = [s.method, rfc3986(baseUrl), rfc3986(normalized)].join('&');
  const key = `${rfc3986(s.consumerSecret)}&${rfc3986(s.tokenSecret ?? '')}`;
  const signature = createHmac('sha1', key).update(base).digest('base64');
  const header =
    'OAuth ' +
    Object.entries({ ...oauth, oauth_signature: signature })
      .map(([k, v]) => `${rfc3986(k)}="${rfc3986(v)}"`)
      .join(', ');
  return { header, base };
}

/* An OAuth 1.0a token endpoint's form-encoded answer. */
export const formAnswer = (text: string): Record<string, string> => Object.fromEntries(new URLSearchParams(text.trim()));
