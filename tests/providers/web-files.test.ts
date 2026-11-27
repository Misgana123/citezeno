import { describe, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { directHttp, isPrivateAddress } from '@/lib/providers/direct-http/fetch';
import { blockText } from '@/lib/providers/direct-http/page';
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

describe('reading web pages', () => {
  const ARTICLE = `<!doctype html><html><head><title>Sleep news</title><script>alert(1)</script></head><body>
    <nav><a href="/">Home</a> <a href="/about">About</a></nav>
    <article><h1>Sleep helps memory</h1>
      <p>${'Researchers found that a full night of sleep improves recall the next day. '.repeat(4)}</p>
      <p>${'The effect was strongest for facts learned in the evening before bed. '.repeat(4)}</p>
      <ul><li>First point</li><li>Second point</li></ul>
    </article>
    <footer>Copyright</footer></body></html>`;
  const html = (body: string, type = 'text/html; charset=utf-8') => () => new Response(body, { headers: { 'content-type': type } });

  it('gives a page’s main text, without menus, scripts or footers', async () => {
    const files = directHttp({ fetch: respond({ 'https://news.example/': html(ARTICLE) }), resolve: publicDns });
    const page = await files.fetchPage('https://news.example/sleep', { maxBytes: 100_000 });
    expect(page.finalUrl).toBe('https://news.example/sleep');
    expect(page.title).toMatch(/Sleep/);
    expect(page.text).toContain('a full night of sleep improves recall');
    expect(page.text).toContain('- First point');
    expect(page.text).not.toMatch(/alert\(1\)|Copyright|About/);
  });

  it('reads a bare page without an <html> element', async () => {
    const files = directHttp({ fetch: respond({ 'https://b.example/': html('<p>Just a paragraph.</p>') }), resolve: publicDns });
    expect((await files.fetchPage('https://b.example/', { maxBytes: 1000 })).text).toBe('Just a paragraph.');
  });

  it('reads plain text as it is', async () => {
    const files = directHttp({ fetch: respond({ 'https://t.example/': html('line one\r\n\r\n\r\n\r\nline two', 'text/plain') }), resolve: publicDns });
    expect(await files.fetchPage('https://t.example/a.txt', { maxBytes: 1000 })).toMatchObject({ title: null, text: 'line one\n\nline two' });
  });

  it('says when the link is a PDF, another file, too large, or private', async () => {
    const files = directHttp({
      fetch: respond({
        'https://a.example/pdf': () => new Response(PDF, { headers: { 'content-type': 'application/pdf' } }),
        'https://a.example/untyped-pdf': () => new Response(PDF),
        'https://a.example/zip': () => new Response('PK', { headers: { 'content-type': 'application/zip' } }),
        'https://a.example/big': html('<p>' + 'x'.repeat(5000) + '</p>'),
      }),
      resolve: async (h) => (h === 'inside.example' ? ['10.0.0.9'] : ['93.184.216.34']),
    });
    await expect(files.fetchPage('https://a.example/pdf', { maxBytes: 100_000 })).rejects.toMatchObject({ details: { reason: 'is_pdf' } });
    await expect(files.fetchPage('https://a.example/untyped-pdf', { maxBytes: 100_000 })).rejects.toMatchObject({ details: { reason: 'is_pdf' } });
    await expect(files.fetchPage('https://a.example/zip', { maxBytes: 100_000 })).rejects.toMatchObject({ details: { reason: 'not_page' } });
    await expect(files.fetchPage('https://a.example/big', { maxBytes: 1000 })).rejects.toMatchObject({ details: { reason: 'too_large' } });
    await expect(files.fetchPage('https://inside.example/', { maxBytes: 1000 })).rejects.toMatchObject({ details: { reason: 'blocked' } });
    await expect(files.fetchPage('https://a.example/missing', { maxBytes: 1000 })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('downloads a file, its kind from its bytes and its name from the site', async () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]);
    const files = directHttp({
      fetch: respond({
        'https://d.example/export?id=1': () => new Response('a,b\n1,2', { headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="survey results.csv"' } }),
        'https://d.example/go': () => new Response(null, { status: 302, headers: { location: '/files/archive.zip' } }),
        'https://d.example/files/archive.zip': () => new Response(zip, { headers: { 'content-type': 'application/octet-stream' } }),
        'https://d.example/report.xlsx': () => new Response(zip),
        'https://d.example/paper': () => new Response(PDF, { headers: { 'content-type': 'application/octet-stream' } }),
        'https://d.example/refs': () => new Response('@article{a, title={T}}', { headers: { 'content-type': 'application/x-bibtex', 'content-disposition': "attachment; filename*=UTF-8''my%20refs" } }),
      }),
      resolve: publicDns,
    });
    expect(await files.fetchFile('https://d.example/export?id=1', { maxBytes: 1000 })).toMatchObject({ name: 'survey results.csv', mime: 'text/csv', bytes: new TextEncoder().encode('a,b\n1,2') });
    expect(await files.fetchFile('https://d.example/go', { maxBytes: 1000 })).toMatchObject({ name: 'archive.zip', mime: 'application/zip', finalUrl: 'https://d.example/files/archive.zip', bytes: zip });
    expect(await files.fetchFile('https://d.example/report.xlsx', { maxBytes: 1000 })).toMatchObject({ name: 'report.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    expect(await files.fetchFile('https://d.example/paper', { maxBytes: 10_000 })).toMatchObject({ name: 'paper.pdf', mime: 'application/pdf' });
    expect(await files.fetchFile('https://d.example/refs', { maxBytes: 1000 })).toMatchObject({ name: 'my refs.bib', mime: 'application/x-bibtex' });
  });

  it('refuses web pages, unknown binaries, big files and private links when downloading', async () => {
    const files = directHttp({
      fetch: respond({
        'https://d.example/page': html('<!DOCTYPE html><html><body>Sign in</body></html>'),
        'https://d.example/untyped-page': () => new Response('\n  <html><body>hi</body></html>'),
        'https://d.example/app.exe': () => new Response(new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0])),
        'https://d.example/big.csv': () => new Response('x'.repeat(5000)),
        'https://d.example/declared': () => new Response('x', { headers: { 'content-length': '999999' } }),
      }),
      resolve: async (h) => (h === 'inside.example' ? ['10.0.0.9'] : ['93.184.216.34']),
    });
    await expect(files.fetchFile('https://d.example/page', { maxBytes: 100_000 })).rejects.toMatchObject({ details: { reason: 'is_page' } });
    await expect(files.fetchFile('https://d.example/untyped-page', { maxBytes: 100_000 })).rejects.toMatchObject({ details: { reason: 'is_page' } });
    await expect(files.fetchFile('https://d.example/app.exe', { maxBytes: 100_000 })).rejects.toMatchObject({ details: { reason: 'not_file' } });
    await expect(files.fetchFile('https://d.example/big.csv', { maxBytes: 2000 })).rejects.toMatchObject({ details: { reason: 'too_large' } });
    await expect(files.fetchFile('https://d.example/declared', { maxBytes: 2000 })).rejects.toMatchObject({ details: { reason: 'too_large' } });
    await expect(files.fetchFile('https://inside.example/a.zip', { maxBytes: 1000 })).rejects.toMatchObject({ details: { reason: 'blocked' } });
    await expect(files.fetchFile('https://d.example/missing', { maxBytes: 1000 })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('turns blocks into lines', () => {
    const { document } = parseHTML('<html><body><h2>Title</h2><p>One <b>two</b></p><table><tr><td>a</td><td>b</td></tr></table>x<br>y</body></html>');
    expect(blockText(document.body as never)).toBe('Title\n\nOne two\n\na | b |\n\nx\ny');
  });
});
