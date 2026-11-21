import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { ProviderError } from '../errors';
import type { GatewayPolicy, Transport } from '../gateway/types';
import type { Gate } from '../types';
import { readAll } from '../web-files/read';
import type { WebFiles, WebPage, WebPageRefusal, WebPdf, WebPdfRefusal } from '../web-files/types';

/* Fetches open-access PDFs (and, for the assistant, web pages) straight from
   the sites that host them.

   Safety: only http(s) links, never a private, loopback or link-local address
   (checked for every redirect, after resolving the name), at most 5 redirects,
   a size limit enforced while reading, and the bytes must start like a PDF.
   The first bytes are checked before anything is passed on. */

export const PROVIDER = 'direct-http';
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 30_000;
/* PDFs may have a little junk before the header; the spec allows 1024 bytes. */
const HEADER_WINDOW = 1024;
const USER_AGENT = 'Mozilla/5.0 (compatible; CitezenoReader/1.0; +https://citezeno.com)';

const refuse = (reason: WebPdfRefusal, message: string, status?: number) =>
  new ProviderError(reason === 'not_found' ? 'not_found' : 'bad_request', message, { provider: PROVIDER, reason, status });

/* Private, loopback, link-local, carrier-grade NAT, multicast and reserved ranges. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224 || (a === 198 && (b === 18 || b === 19));
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s === '::' || s === '::1') return true;
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(s);
  }
  return true;
}

export type Resolve = (host: string) => Promise<string[]>;
const dnsResolve: Resolve = async (host) => (await lookup(host, { all: true })).map((a) => a.address);

async function checkUrl(raw: string, resolve: Resolve): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw refuse('blocked', 'That link is not valid.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw refuse('blocked', 'Only web links can be opened.');
  if (url.username || url.password) throw refuse('blocked', 'Links with passwords are not opened.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) throw refuse('blocked', 'That link points to a private address.');
  const addresses = isIP(host) ? [host] : await resolve(host).catch(() => {
    throw new ProviderError('unavailable', 'The site could not be found.', { provider: PROVIDER, reason: 'dns' });
  });
  if (!addresses.length || addresses.some(isPrivateAddress)) throw refuse('blocked', 'That link points to a private address.');
  return url;
}

/* A stream that passes `head` first, then the rest, failing past maxBytes. */
function capped(head: Uint8Array, rest: ReadableStreamDefaultReader<Uint8Array>, maxBytes: number): ReadableStream<Uint8Array> {
  let total = head.byteLength;
  let sentHead = false;
  return new ReadableStream<Uint8Array>({
    async pull(c) {
      if (!sentHead) {
        sentHead = true;
        if (head.byteLength) return c.enqueue(head);
      }
      const { done, value } = await rest.read();
      if (done) return c.close();
      total += value.byteLength;
      if (total > maxBytes) {
        await rest.cancel().catch(() => {});
        return c.error(refuse('too_large', 'The file is too large.'));
      }
      c.enqueue(value);
    },
    cancel: (why) => rest.cancel(why),
  });
}

const looksLikePdf = (b: Uint8Array) => {
  const s = new TextDecoder('latin1').decode(b.subarray(0, HEADER_WINDOW));
  return s.includes('%PDF-');
};

/* pdf: an open-access file, streamed. page: a web page's HTML (or plain text), read whole. */
type WebRequest = { url: string; maxBytes: number; kind?: 'pdf' | 'page' };
/* A page as fetched, before its text is pulled out. */
export type RawPage = { body: string; contentType: string; finalUrl: string };

const ACCEPT = { pdf: 'application/pdf,*/*;q=0.8', page: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5' };
const PAGE_TYPES = /^(text\/html|application\/xhtml\+xml|text\/plain)\b/i;

const refusePage = (reason: WebPageRefusal, message: string, status?: number) =>
  new ProviderError(reason === 'not_found' ? 'not_found' : 'bad_request', message, { provider: PROVIDER, reason, status });

/* The text of a page's bytes, in the charset the site declared (UTF-8 when it didn't or it's unknown). */
function decode(bytes: Uint8Array, contentType: string): string {
  const charset = contentType.match(/charset=["']?([\w-]+)/i)?.[1];
  try {
    return new TextDecoder(charset || 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

export function createDirectTransport(doFetch: typeof fetch = fetch, resolve: Resolve = dnsResolve): Transport<WebRequest> {
  return {
    async call<T>(req: WebRequest) {
      const kind = req.kind ?? 'pdf';
      let url = await checkUrl(req.url, resolve);
      let res: Response | null = null;
      for (let hop = 0; ; hop++) {
        try {
          res = await doFetch(url, {
            redirect: 'manual',
            headers: { accept: ACCEPT[kind], 'user-agent': USER_AGENT },
            signal: AbortSignal.timeout(TIMEOUT_MS),
            cache: 'no-store',
          });
        } catch (e) {
          const timedOut = (e as Error)?.name === 'TimeoutError' || (e as Error)?.name === 'AbortError';
          throw new ProviderError('unavailable', timedOut ? 'The site took too long to answer.' : 'The site could not be reached.', { provider: PROVIDER, reason: timedOut ? 'timeout' : 'network' });
        }
        const location = res.headers.get('location');
        if (res.status >= 300 && res.status < 400 && location) {
          await res.body?.cancel().catch(() => {});
          if (hop >= MAX_REDIRECTS) throw kind === 'page' ? refusePage('not_page', 'The link redirected too many times.') : refuse('not_pdf', 'The link redirected too many times.');
          url = await checkUrl(new URL(location, url).toString(), resolve);
          continue;
        }
        break;
      }
      if (res.status === 404 || res.status === 410) throw refuse('not_found', kind === 'page' ? 'The site says the page isn’t there.' : 'The site says the file isn’t there.', res.status);
      if (res.status === 429) throw new ProviderError('busy', 'The site is limiting requests.', { provider: PROVIDER, status: 429 });
      if (!res.ok || !res.body) {
        await res.body?.cancel().catch(() => {});
        throw kind === 'page' ? refusePage('not_page', `The site answered ${res.status}.`, res.status) : refuse('not_pdf', `The site answered ${res.status}.`, res.status);
      }
      const declared = Number(res.headers.get('content-length'));
      const size = Number.isFinite(declared) && declared > 0 ? declared : null;
      if (kind === 'page') return { body: (await readPage(res, url, size, req.maxBytes)) as T, costUsd: 0, status: res.status };
      if (size != null && size > req.maxBytes) {
        await res.body.cancel().catch(() => {});
        throw refuse('too_large', 'The file is too large.');
      }
      // read just enough to see the PDF header
      const reader = res.body.getReader();
      let head = new Uint8Array(0);
      while (head.byteLength < HEADER_WINDOW) {
        const { done, value } = await reader.read();
        if (done) break;
        const next = new Uint8Array(head.byteLength + value.byteLength);
        next.set(head);
        next.set(value, head.byteLength);
        head = next;
      }
      if (!looksLikePdf(head)) {
        await reader.cancel().catch(() => {});
        throw refuse('not_pdf', 'The link gave a web page, not a PDF.');
      }
      if (head.byteLength > req.maxBytes) {
        await reader.cancel().catch(() => {});
        throw refuse('too_large', 'The file is too large.');
      }
      const body: WebPdf = { stream: capped(head, reader, req.maxBytes), size, finalUrl: url.toString() };
      return { body: body as T, costUsd: 0, status: res.status };
    },
  };
}

/* A page's HTML or text, checked to be a page (a PDF says so, so it can be read as one). */
async function readPage(res: Response, url: URL, size: number | null, maxBytes: number): Promise<RawPage> {
  const contentType = res.headers.get('content-type') ?? '';
  if (/^application\/pdf\b/i.test(contentType)) {
    await res.body?.cancel().catch(() => {});
    throw refusePage('is_pdf', 'The link is a PDF.');
  }
  if (contentType && !PAGE_TYPES.test(contentType)) {
    await res.body?.cancel().catch(() => {});
    throw refusePage('not_page', 'The link is a file, not a web page.');
  }
  if (size != null && size > maxBytes) {
    await res.body?.cancel().catch(() => {});
    throw refusePage('too_large', 'The page is too large.');
  }
  const bytes = await readAll(res.body!, maxBytes).catch((e) => {
    throw (e as ProviderError)?.details?.reason === 'too_large' ? refusePage('too_large', 'The page is too large.') : e;
  });
  if (looksLikePdf(bytes.subarray(0, HEADER_WINDOW))) throw refusePage('is_pdf', 'The link is a PDF.');
  return { body: decode(bytes, contentType), contentType, finalUrl: url.toString() };
}

/* Free, never cached; a few at a time so one slow site can't hold everything up. */
export const directPolicy: GatewayPolicy<WebRequest> = {
  provider: PROVIDER,
  label: 'Open-access downloads',
  describe: () => ({ search: false, cacheKey: null, cacheTtlS: 0 }),
  spend: null,
  concurrency: 6,
  maxQueue: 60,
  retryTries: 2,
};

const ungated: Gate = (t) => t;

export function directHttp(deps: { fetch?: typeof fetch; resolve?: Resolve; gate?: Gate } = {}): WebFiles {
  const transport = (deps.gate ?? ungated)(createDirectTransport(deps.fetch ?? fetch, deps.resolve), directPolicy);
  return {
    name: PROVIDER,
    async fetchPdf(url, opts) {
      return (await transport.call<WebPdf>({ url, maxBytes: opts.maxBytes })).body;
    },
    async fetchPage(url, opts): Promise<WebPage> {
      const raw = (await transport.call<RawPage>({ url, maxBytes: opts.maxBytes, kind: 'page' })).body;
      // the HTML reader is loaded only when a page is read
      const { readablePage } = await import('./page');
      const page = readablePage(raw);
      if (!page.text) throw refusePage('not_page', 'The page has no readable text.');
      return page;
    },
  };
}
