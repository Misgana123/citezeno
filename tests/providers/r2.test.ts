import { describe, expect, it, vi } from 'vitest';
import { keyPath, presign, rfc3986 } from '@/lib/providers/r2/sign';
import { r2Config, r2Store } from '@/lib/providers/r2/store';
import { DEFAULT_FILE_STORAGE } from '@/lib/providers/storage/registry';
import type { Gate } from '@/lib/providers/types';

describe('SigV4 presigning', () => {
  it('matches AWS’s documented presigned URL example', () => {
    // https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
    const url = presign(
      { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1', service: 's3' },
      { method: 'GET', host: 'examplebucket.s3.amazonaws.com', path: '/test.txt', expiresS: 86400, nowMs: Date.UTC(2013, 4, 24) },
    );
    expect(new URL(url).searchParams.get('X-Amz-Signature')).toBe('aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');
  });

  it('encodes keys per RFC 3986 and keeps slashes', () => {
    expect(rfc3986("a b!'()*")).toBe('a%20b%21%27%28%29%2A');
    expect(keyPath('bucket', 'shelf/u1/my file.pdf')).toBe('/bucket/shelf/u1/my%20file.pdf');
  });
});

describe('R2 store', () => {
  const env = { R2_ACCOUNT_ID: 'acct', R2_ACCESS_KEY_ID: 'AK', R2_SECRET_ACCESS_KEY: 'top-secret', R2_BUCKET: 'papers' };
  const config = r2Config(env)!;

  it('is the default storage and reads its config', () => {
    expect(DEFAULT_FILE_STORAGE).toEqual(['r2']);
    expect(config.endpoint).toBe('https://acct.r2.cloudflarestorage.com');
    expect(r2Config({ ...env, R2_ENDPOINT: 'https://acct.eu.r2.cloudflarestorage.com/' })!.endpoint).toBe('https://acct.eu.r2.cloudflarestorage.com');
    expect(r2Config({ ...env, R2_BUCKET: ' ' })).toBeNull();
  });

  it('gives the browser a presigned PUT without the secret', () => {
    const store = r2Store(config, { now: () => 1_700_000_000_000 });
    const t = store.uploadTarget('shelf/u1/f1.pdf');
    const url = new URL(t.url);
    expect(t.method).toBe('PUT');
    expect(t.headers).toEqual({ 'content-type': 'application/pdf' });
    expect(url.host).toBe('acct.r2.cloudflarestorage.com');
    expect(url.pathname).toBe('/papers/shelf/u1/f1.pdf');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(url.searchParams.get('X-Amz-Credential')).toBe('AK/20231114/auto/s3/aws4_request');
    expect(JSON.stringify(t)).not.toContain('top-secret');
  });

  it('makes expiring links, as a download or inline', () => {
    const store = r2Store(config, { now: () => 1_700_000_000_000 });
    const down = new URL(store.downloadUrl('k.pdf', { ttlS: 300, fileName: 'Naïve "paper".pdf' }));
    expect(down.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(down.searchParams.get('response-content-disposition')).toBe(`attachment; filename="Na_ve _paper_.pdf"; filename*=UTF-8''Na%C3%AFve%20%22paper%22.pdf`);
    const inline = new URL(store.downloadUrl('k.pdf', { ttlS: 60, inline: true }));
    expect(inline.searchParams.get('response-content-disposition')).toBe('inline');
  });

  it('reads with a size cap, writes and deletes through the gate', async () => {
    const seen: string[] = [];
    const gate: Gate = (t, p) => {
      seen.push(p.provider);
      return t;
    };
    const calls: { method: string; path: string }[] = [];
    const fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = new URL(String(url));
      calls.push({ method: init?.method ?? 'GET', path: u.pathname });
      if (u.pathname.endsWith('missing')) return new Response('', { status: 404 });
      if (init?.method === 'DELETE') return new Response(null, { status: u.pathname.endsWith('gone') ? 404 : 204 });
      if (init?.method === 'PUT') return new Response(null, { status: 200 });
      return new Response(new Uint8Array(10), { headers: { 'content-length': '10' } });
    }) as unknown as typeof globalThis.fetch;
    const store = r2Store(config, { fetch, gate });
    expect(seen).toEqual(['r2']);
    expect((await store.read('ok', 100))?.byteLength).toBe(10);
    expect(await store.read('ok', 5)).toBeNull();
    expect(await store.read('missing', 100)).toBeNull();
    await store.write('shared/x.pdf', new Uint8Array(3), 'application/pdf');
    await store.remove('x');
    await store.remove('gone');
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([
      { method: 'PUT', path: '/papers/shared/x.pdf' },
      { method: 'DELETE', path: '/papers/x' },
      { method: 'DELETE', path: '/papers/gone' },
    ]);
  });

  it('reports failures in the common errors', async () => {
    const busy = r2Store(config, { fetch: vi.fn(async () => new Response('', { status: 429 })) as never });
    await expect(busy.read('x', 10)).rejects.toMatchObject({ name: 'ProviderError', code: 'busy' });
    const down = r2Store(config, { fetch: vi.fn(async () => new Response('', { status: 500 })) as never });
    await expect(down.write('x', new Uint8Array(1), 'application/pdf')).rejects.toMatchObject({ code: 'unavailable' });
    await expect(down.remove('x')).rejects.toMatchObject({ code: 'unavailable' });
  });
});
