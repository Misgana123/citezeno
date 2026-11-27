import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { connectorKeys, seal, unseal } from '@/lib/connectors/crypto';
import { packState, readState, safeBack } from '@/lib/connectors/state';
import { connectorHttpError, connectorTransport } from '@/lib/providers/connectors/http';
import { expiresAt, formAnswer, oauth1Header, rfc3986, tokenRequest } from '@/lib/providers/connectors/oauth';
import { isConnectorAuthError } from '@/lib/providers/connectors/types';

const keys = connectorKeys({ CONNECTORS_SECRET: 'a'.repeat(40) })!;

describe('sealing tokens', () => {
  it('needs a secret of at least 32 characters', () => {
    expect(connectorKeys({})).toBeNull();
    expect(connectorKeys({ CONNECTORS_SECRET: 'short' })).toBeNull();
    expect(keys).not.toBeNull();
  });

  it('round-trips, and fails closed with another key or a changed value', () => {
    const sealed = seal({ accessToken: 'tok', n: 1 }, keys);
    expect(sealed.startsWith('v1.')).toBe(true);
    expect(sealed).not.toContain('tok');
    expect(unseal(sealed, keys)).toEqual({ accessToken: 'tok', n: 1 });
    expect(unseal(sealed, connectorKeys({ CONNECTORS_SECRET: 'b'.repeat(40) })!)).toBeNull();
    const flipped = sealed.slice(0, -2) + (sealed.endsWith('A') ? 'B' : 'A') + sealed.slice(-1);
    expect(unseal(flipped, keys)).toBeNull();
    expect(unseal('plain', keys)).toBeNull();
  });

  it('seals the same value differently each time', () => {
    expect(seal('x', keys)).not.toBe(seal('x', keys));
  });
});

describe('sign-in state', () => {
  const base = { userId: 'u1', connector: 'zotero', nonce: 'n1', verifier: 'v', back: '/app/shelf', expires: 2_000 };

  it('reads back only for the same user, connector and nonce, before it expires', () => {
    const c = packState(base, keys);
    expect(readState(c, keys, { userId: 'u1', connector: 'zotero', nonce: 'n1' }, 1_000)).toMatchObject({ verifier: 'v', back: '/app/shelf' });
    expect(readState(c, keys, { userId: 'u2', connector: 'zotero', nonce: 'n1' }, 1_000)).toBeNull();
    expect(readState(c, keys, { userId: 'u1', connector: 'notion', nonce: 'n1' }, 1_000)).toBeNull();
    expect(readState(c, keys, { userId: 'u1', connector: 'zotero', nonce: 'other' }, 1_000)).toBeNull();
    expect(readState(c, keys, { userId: 'u1', connector: 'zotero', nonce: 'n1' }, 3_000)).toBeNull();
    expect(readState(c, keys, { userId: 'u1', connector: 'zotero', nonce: null }, 1_000)).not.toBeNull();
  });

  it('refuses a changed or unsigned cookie', () => {
    const c = packState(base, keys);
    const [data, sig] = c.split('.');
    const forged = Buffer.from(JSON.stringify({ ...base, userId: 'attacker' })).toString('base64url');
    expect(readState(`${forged}.${sig}`, keys, { userId: 'attacker', connector: 'zotero', nonce: 'n1' }, 1_000)).toBeNull();
    expect(readState(data, keys, { userId: 'u1', connector: 'zotero', nonce: 'n1' }, 1_000)).toBeNull();
    expect(readState(undefined, keys, { userId: 'u1', connector: 'zotero', nonce: 'n1' }, 1_000)).toBeNull();
  });

  it('only sends users back to our own pages', () => {
    expect(safeBack('/app/shelf')).toBe('/app/shelf');
    expect(safeBack('//evil.com')).toBe('/app/account#apps');
    expect(safeBack('https://evil.com')).toBe('/app/account#apps');
    expect(safeBack(null)).toBe('/app/account#apps');
  });
});

describe('OAuth 1.0a signing', () => {
  // OAuth Core 1.0, appendix A.5 (photos.example.net)
  it('matches the specification’s example signature', () => {
    const { header, base } = oauth1Header({
      method: 'GET',
      url: 'http://photos.example.net/photos?file=vacation.jpg&size=original',
      consumerKey: 'dpf43f3p2l4k3l03',
      consumerSecret: 'kd94hf93k423kf44',
      token: 'nnch734d00sl2jdk',
      tokenSecret: 'pfkkdhi9sl3r4s00',
      nonce: 'kllo9940pd9333jh',
      timestamp: 1191242096,
    });
    expect(base).toBe(
      'GET&http%3A%2F%2Fphotos.example.net%2Fphotos&file%3Dvacation.jpg%26oauth_consumer_key%3Ddpf43f3p2l4k3l03%26oauth_nonce%3Dkllo9940pd9333jh%26oauth_signature_method%3DHMAC-SHA1%26oauth_timestamp%3D1191242096%26oauth_token%3Dnnch734d00sl2jdk%26oauth_version%3D1.0%26size%3Doriginal',
    );
    expect(header).toContain(`oauth_signature="${rfc3986('tR3+Ty81lMeYAr/Fid0kMTYa/WM=')}"`);
  });

  it('reads form-encoded token answers', () => {
    expect(formAnswer('oauth_token=a&oauth_token_secret=b&userID=12&username=x%20y')).toEqual({ oauth_token: 'a', oauth_token_secret: 'b', userID: '12', username: 'x y' });
  });
});

describe('connector HTTP', () => {
  const settings = { provider: 'demo', label: 'Demo' };

  it('turns 401 into "connect again" and other failures into the shared errors', () => {
    expect(isConnectorAuthError(connectorHttpError(settings, 401, '', new Headers()))).toBe(true);
    expect(connectorHttpError(settings, 404, '', new Headers())).toMatchObject({ code: 'not_found' });
    expect(connectorHttpError(settings, 429, '', new Headers({ 'retry-after': '3' }))).toMatchObject({ code: 'busy', details: { retryAfterS: 3 } });
    expect(connectorHttpError(settings, 400, '{"message":"bad column"}', new Headers())).toMatchObject({ code: 'bad_request', message: 'Demo couldn’t do this: bad column' });
    expect(connectorHttpError(settings, 502, '', new Headers())).toMatchObject({ code: 'unavailable' });
  });

  it('sends JSON, form and raw bodies, and caps downloads', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const doFetch = (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      if (String(url).includes('big')) return new Response(new Uint8Array(2000), { headers: { 'content-type': 'application/pdf' } });
      return Response.json({ ok: true });
    }) as unknown as typeof fetch;
    const t = connectorTransport({ ...settings, fetch: doFetch });
    await t.call({ method: 'POST', url: 'https://x.test/a', query: { q: 'hi', empty: '' }, json: { a: 1 } });
    await t.call({ method: 'POST', url: 'https://x.test/b', form: { a: '1 2' } });
    expect(seen[0].url).toBe('https://x.test/a?q=hi');
    expect((seen[0].init.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect(seen[1].init.body).toBe('a=1+2');
    await expect(t.call({ method: 'GET', url: 'https://x.test/big', expect: 'bytes', maxBytes: 1000 })).rejects.toMatchObject({ code: 'bad_request', details: { reason: 'too_large' } });
    const ok = await t.call<{ bytes: Uint8Array; contentType: string }>({ method: 'GET', url: 'https://x.test/big', expect: 'bytes', maxBytes: 5000 });
    expect(ok.body.bytes.byteLength).toBe(2000);
    expect(ok.body.contentType).toBe('application/pdf');
  });

  it('a refused grant at the token endpoint means "connect again"', async () => {
    const t = connectorTransport({ ...settings, fetch: (async () => new Response('{"error":"invalid_grant"}', { status: 400 })) as unknown as typeof fetch });
    const err = await tokenRequest(t, { clientId: 'c', clientSecret: 's', tokenUrl: 'https://x.test/token', provider: 'demo', label: 'Demo', clientAuth: 'body' }, { grant_type: 'refresh_token' }).catch((e) => e);
    expect(isConnectorAuthError(err)).toBe(true);
  });

  it('expires a minute early', () => {
    expect(expiresAt(3600, 0)).toBe(3540_000);
    expect(expiresAt(undefined, 0)).toBeNull();
  });
});
