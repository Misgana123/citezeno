import { ProviderError } from '../errors';
import type { GatewayPolicy, Transport } from '../gateway/types';
import { sharedProviderConfig } from '../shared';
import type { Env } from '../types';
import { ConnectorAuthError } from './types';

/* One HTTP call shape for every connector adapter: any method, a JSON, form or
   raw body, and a JSON, text or bytes answer. Calls carry a user's own token,
   so they are never cached or shared between requests. */

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export type ConnectorRequest = {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  url: string;
  query?: QueryParams;
  /* sent as is (the user's token goes here); never logged */
  headers?: Record<string, string>;
  json?: unknown;
  form?: Record<string, string>;
  raw?: { bytes: Uint8Array; contentType: string };
  /* default 'json'; 'none' ignores the body (204 answers); 'json+headers'
     answers { data, headers } (for vendors that put totals and versions in headers) */
  expect?: 'json' | 'json+headers' | 'text' | 'bytes' | 'none';
  /* the most bytes a 'bytes' or 'text' answer may have */
  maxBytes?: number;
};

export type BytesBody = { bytes: Uint8Array; contentType: string; fileName: string | null };
export type WithHeaders<T> = { data: T; headers: Record<string, string> };

export type ConnectorTransport = Transport<ConnectorRequest>;

export type ConnectorHttpSettings = { provider: string; label: string; timeoutMs?: number; fetch?: typeof fetch };

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

export function withQuery(url: string, query: QueryParams = {}): string {
  const u = new URL(url);
  for (const [k, v] of Object.entries(query)) if (v != null && v !== '') u.searchParams.set(k, String(v));
  return u.toString();
}

function retryAfter(headers: Headers): number | undefined {
  const n = Number(headers.get('retry-after'));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/* The vendor's own words for a failure, when it gives them (kept short). */
export function vendorReason(text: string): string | undefined {
  try {
    const j = JSON.parse(text) as { error?: unknown; message?: unknown; error_description?: unknown };
    const e = j.error as { message?: unknown } | string | undefined;
    const msg = typeof j.message === 'string' ? j.message : typeof e === 'object' && typeof e?.message === 'string' ? e.message : typeof j.error_description === 'string' ? j.error_description : typeof e === 'string' ? e : '';
    if (msg) return msg.slice(0, 300);
  } catch {
    /* not JSON */
  }
  return text.replace(/\s+/g, ' ').trim().slice(0, 300) || undefined;
}

/* A failed answer → the shared errors. 401 means the user's token no longer works. */
export function connectorHttpError(s: Pick<ConnectorHttpSettings, 'provider' | 'label'>, status: number, text: string, headers: Headers): Error {
  const provider = s.provider;
  const reason = vendorReason(text);
  if (status === 401) return new ConnectorAuthError(provider, `${s.label} no longer accepts this connection.`);
  if (status === 429) return new ProviderError('busy', `${s.label} is rate limiting requests. Try again in a moment.`, { provider, status, reason, retryAfterS: retryAfter(headers) });
  if (status === 404) return new ProviderError('not_found', `${s.label} couldn’t find that, or it isn’t shared with Citezeno.`, { provider, status, reason });
  if (status === 403) return new ProviderError('bad_request', `${s.label} didn’t allow this${reason ? `: ${reason}` : '.'}`, { provider, status, reason });
  if (status >= 400 && status < 500) return new ProviderError('bad_request', `${s.label} couldn’t do this${reason ? `: ${reason}` : '.'}`, { provider, status, reason });
  return new ProviderError('unavailable', `${s.label} answered ${status}.`, { provider, status, reason });
}

async function readCapped(res: Response, maxBytes: number, provider: string): Promise<Uint8Array> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new ProviderError('bad_request', `This file is larger than ${Math.round(maxBytes / (1024 * 1024))} MB.`, { provider, reason: 'too_large' });
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new ProviderError('bad_request', `This file is larger than ${Math.round(maxBytes / (1024 * 1024))} MB.`, { provider, reason: 'too_large' });
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

function fileNameOf(headers: Headers): string | null {
  const cd = headers.get('content-disposition') ?? '';
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  if (star) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      /* fall through */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(cd);
  return plain ? plain[1] : null;
}

export function connectorTransport(s: ConnectorHttpSettings): ConnectorTransport {
  const doFetch = s.fetch ?? fetch;
  const userAgent = sharedProviderConfig().userAgent;
  return {
    async call<T>(req: ConnectorRequest) {
      const expect = req.expect ?? 'json';
      const json = expect === 'json' || expect === 'json+headers';
      const headers: Record<string, string> = { 'user-agent': userAgent, ...(json ? { accept: 'application/json' } : {}), ...req.headers };
      let body: BodyInit | undefined;
      if (req.json !== undefined) {
        headers['content-type'] = 'application/json';
        body = JSON.stringify(req.json);
      } else if (req.form) {
        headers['content-type'] = 'application/x-www-form-urlencoded';
        body = new URLSearchParams(req.form).toString();
      } else if (req.raw) {
        headers['content-type'] = req.raw.contentType;
        body = req.raw.bytes as unknown as BodyInit;
      }
      let res: Response;
      try {
        res = await doFetch(withQuery(req.url, req.query), { method: req.method, headers, body, signal: AbortSignal.timeout(s.timeoutMs ?? DEFAULT_TIMEOUT_MS), cache: 'no-store', redirect: 'follow' });
      } catch (e) {
        const timedOut = (e as Error)?.name === 'TimeoutError' || (e as Error)?.name === 'AbortError';
        throw new ProviderError('unavailable', timedOut ? `${s.label} timed out.` : `Could not reach ${s.label}.`, { provider: s.provider, reason: timedOut ? 'timeout' : 'network' });
      }
      if (!res.ok) throw connectorHttpError(s, res.status, await res.text().catch(() => ''), res.headers);
      if (expect === 'none') {
        await res.body?.cancel().catch(() => {});
        return { body: null as T, costUsd: 0, status: res.status };
      }
      if (expect === 'bytes') {
        const bytes = await readCapped(res, req.maxBytes ?? DEFAULT_MAX_BYTES, s.provider);
        const out: BytesBody = { bytes, contentType: (res.headers.get('content-type') ?? 'application/octet-stream').split(';')[0].trim(), fileName: fileNameOf(res.headers) };
        return { body: out as T, costUsd: 0, status: res.status };
      }
      const text = new TextDecoder().decode(await readCapped(res, req.maxBytes ?? DEFAULT_MAX_BYTES, s.provider));
      if (expect === 'text') return { body: text as T, costUsd: 0, status: res.status };
      const wrap = (data: unknown) => (expect === 'json+headers' ? ({ data, headers: Object.fromEntries(res.headers.entries()) } satisfies WithHeaders<unknown>) : data) as T;
      if (!text.trim()) return { body: wrap({}), costUsd: 0, status: res.status };
      try {
        return { body: wrap(JSON.parse(text)), costUsd: 0, status: res.status };
      } catch {
        throw new ProviderError('unavailable', `${s.label} sent an unreadable answer.`, { provider: s.provider, status: res.status });
      }
    },
  };
}

/* A connector's calls: free, never cached (each carries one user's token),
   429s tried again, and an optional shared speed limit. Writes aren't
   repeated after a failure, so hiccups aren't retried either. */
export function connectorPolicy(o: { provider: string; label: string; env: Env; ratePerS?: number; concurrency?: number }): GatewayPolicy<ConnectorRequest> {
  const maxWaitMs = sharedProviderConfig(o.env).maxWaitMs;
  return {
    provider: o.provider,
    label: o.label,
    describe: () => ({ search: false, cacheKey: null, cacheTtlS: 0 }),
    spend: null,
    concurrency: o.concurrency ?? 8,
    maxQueue: 60,
    retryTries: 3,
    ...(o.ratePerS ? { rate: { perSecond: o.ratePerS, maxWaitMs } } : {}),
  };
}

/* Bytes → base64url, for PKCE and signatures. */
export const base64url = (b: Uint8Array | Buffer) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
