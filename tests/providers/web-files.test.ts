import { describe, expect, it, vi } from 'vitest';
import { directHttp, isPrivateAddress } from '@/lib/providers/direct-http/fetch';
import { readAll } from '@/lib/providers/web-files/read';
import { WEB_FILES_PROVIDERS } from '@/lib/providers/web-files/registry';

const PDF = new TextEncoder().encode('%PDF-1.7\n' + 'x'.repeat(3000));
const publicDns = async () => ['93.184.216.34'];

function respond(map: Record<string, () => Response>) {
  return vi.fn(async (url: string | URL) => {
    const u = String(url);
    const hit = Object.entries(map).find(([k]) => u.startsWith(k));
    return hit ? hit[1]() : new Response('nope', { status: 404 });
  }) as unknown as typeof fetch;
}

describe('web files', () => {
  it('is registered under its job', () => {
    expect(Object.keys(WEB_FILES_PROVIDERS)).toEqual(['direct-http']);
  });

  it('spots private addresses', () => {
    for (const ip of ['10.0.0.1', '127.0.0.1', '192.168.1.5', '172.20.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ['93.184.216.34', '8.8.8.8', '2606:4700::1111']) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it('follows redirects and passes the whole PDF on as a stream', async () => {
    const fetch = respond({
      'https://pub.example/a': () => new Response(null, { status: 302, headers: { location: '/files/a.pdf' } }),
      'https://pub.example/files/a.pdf': () => new Response(PDF, { headers: { 'content-length': String(PDF.byteLength) } }),
    });
    const files = directHttp({ fetch, resolve: publicDns });
    const got = await files.fetchPdf('https://pub.example/a', { maxBytes: 10_000 });
    expect(got.finalUrl).toBe('https://pub.example/files/a.pdf');
    expect(got.size).toBe(PDF.byteLength);
    expect(await readAll(got.stream, 10_000)).toEqual(PDF);
  });

  it('refuses a sign-in page instead of a PDF', async () => {
    const files = directHttp({ fetch: respond({ 'https://pub.example/': () => new Response('<html>Sign in</html>', { headers: { 'content-type': 'text/html' } }) }), resolve: publicDns });
    await expect(files.fetchPdf('https://pub.example/a.pdf', { maxBytes: 10_000 })).rejects.toMatchObject({ code: 'bad_request', details: { reason: 'not_pdf' } });
  });

  it('refuses private addresses, other schemes and redirects into the private network', async () => {
    const fetch = respond({ 'https://pub.example/': () => new Response(null, { status: 301, headers: { location: 'http://169.254.169.254/latest' } }) });
    const files = directHttp({ fetch, resolve: async (h) => (h === 'inside.example' ? ['10.1.2.3'] : ['93.184.216.34']) });
    await expect(files.fetchPdf('https://pub.example/a.pdf', { maxBytes: 10 })).rejects.toMatchObject({ details: { reason: 'blocked' } });
    await expect(files.fetchPdf('https://inside.example/a.pdf', { maxBytes: 10 })).rejects.toMatchObject({ details: { reason: 'blocked' } });
    await expect(files.fetchPdf('file:///etc/passwd', { maxBytes: 10 })).rejects.toMatchObject({ details: { reason: 'blocked' } });
    await expect(files.fetchPdf('http://localhost:3000/x', { maxBytes: 10 })).rejects.toMatchObject({ details: { reason: 'blocked' } });
  });

  it('enforces the size limit, declared or not', async () => {
    const declared = directHttp({ fetch: respond({ 'https://pub.example/': () => new Response(PDF, { headers: { 'content-length': '999999' } }) }), resolve: publicDns });
    await expect(declared.fetchPdf('https://pub.example/a.pdf', { maxBytes: 5000 })).rejects.toMatchObject({ details: { reason: 'too_large' } });
    const chunked = directHttp({ fetch: respond({ 'https://pub.example/': () => new Response(new Blob([PDF]).stream()) }), resolve: publicDns });
    await expect(chunked.fetchPdf('https://pub.example/a.pdf', { maxBytes: 2000 })).rejects.toMatchObject({ details: { reason: 'too_large' } });
    // a file that grows past the limit while it streams
    const parts = [PDF.slice(0, 1500), PDF.slice(1500), PDF.slice(1500)];
    const growing = directHttp({ fetch: respond({ 'https://pub.example/': () => new Response(new ReadableStream({ pull(c) { const p = parts.shift(); if (p) c.enqueue(p); else c.close(); } })) }), resolve: publicDns });
    const got = await growing.fetchPdf('https://pub.example/a.pdf', { maxBytes: 4000 });
    await expect(readAll(got.stream, 100_000)).rejects.toMatchObject({ details: { reason: 'too_large' } });
  });

  it('reports missing files and busy sites in the common errors', async () => {
    const files = directHttp({ fetch: respond({ 'https://pub.example/busy': () => new Response('', { status: 429 }) }), resolve: publicDns });
    await expect(files.fetchPdf('https://pub.example/gone.pdf', { maxBytes: 10 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(files.fetchPdf('https://pub.example/busy', { maxBytes: 10 })).rejects.toMatchObject({ code: 'busy' });
  });
});
