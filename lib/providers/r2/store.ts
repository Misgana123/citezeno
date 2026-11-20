import { ProviderError } from '../errors';
import type { GatewayPolicy, Transport } from '../gateway/types';
import type { FileStore, UploadTarget } from '../storage/types';
import type { Gate } from '../types';
import { keyPath, presign, type SigV4Creds } from './sign';

/* PDF storage on Cloudflare R2 (a private bucket), through its S3-compatible
   API with presigned URLs (no SDK).

     R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
     R2_ENDPOINT (optional, e.g. https://<account>.eu.r2.cloudflarestorage.com)

   The browser uploads with a short-lived presigned PUT; files are read back
   only through short-lived presigned GET links. The secret never leaves the
   server. Signing is local; the calls that reach R2 from our server (read,
   write, delete) go through the gateway. */

export const PROVIDER = 'r2';

export type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string; endpoint: string };

export function r2Config(env: Record<string, string | undefined>): R2Config | null {
  const accountId = env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = env.R2_BUCKET?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  const endpoint = (env.R2_ENDPOINT?.trim() || `https://${accountId}.r2.cloudflarestorage.com`).replace(/\/+$/, '');
  return { accountId, accessKeyId, secretAccessKey, bucket, endpoint };
}

/* How long the browser's upload link stays valid. */
const UPLOAD_TTL_S = 15 * 60;
/* Server-side calls are signed just before they are sent. */
const CALL_TTL_S = 5 * 60;

export type R2Request =
  | { op: 'read'; url: string; maxBytes: number }
  | { op: 'write'; url: string; bytes: Uint8Array; contentType: string }
  | { op: 'delete'; url: string };

function failed(op: string, status: number): ProviderError {
  const what = `R2 ${op} failed (${status}).`;
  if (status === 429 || status === 503) return new ProviderError('busy', what, { provider: PROVIDER, status });
  return new ProviderError('unavailable', what, { provider: PROVIDER, status });
}

export function createR2Transport(doFetch: typeof fetch = fetch): Transport<R2Request> {
  return {
    async call<T>(req: R2Request) {
      let res: Response;
      try {
        if (req.op === 'read') res = await doFetch(req.url, { cache: 'no-store', signal: AbortSignal.timeout(30_000) });
        else if (req.op === 'write') res = await doFetch(req.url, { method: 'PUT', body: req.bytes as BodyInit, headers: { 'content-type': req.contentType }, signal: AbortSignal.timeout(60_000) });
        else res = await doFetch(req.url, { method: 'DELETE', signal: AbortSignal.timeout(15_000) });
      } catch (e) {
        const timedOut = (e as Error)?.name === 'TimeoutError' || (e as Error)?.name === 'AbortError';
        throw new ProviderError('unavailable', timedOut ? 'R2 timed out.' : 'Could not reach R2.', { provider: PROVIDER, reason: timedOut ? 'timeout' : 'network' });
      }
      if (req.op === 'read') {
        if (res.status === 404) return { body: null as T, costUsd: 0, status: 404 };
        if (!res.ok) throw failed('download', res.status);
        const declared = Number(res.headers.get('content-length'));
        if (Number.isFinite(declared) && declared > req.maxBytes) {
          await res.body?.cancel().catch(() => {});
          return { body: null as T, costUsd: 0, status: res.status };
        }
        const buf = new Uint8Array(await res.arrayBuffer());
        return { body: (buf.byteLength > req.maxBytes ? null : buf) as T, costUsd: 0, status: res.status };
      }
      // deleting something already gone is fine
      if (!res.ok && !(req.op === 'delete' && res.status === 404)) throw failed(req.op === 'write' ? 'upload' : 'delete', res.status);
      return { body: null as T, costUsd: 0, status: res.status };
    },
  };
}

/* Not billed per call here, never cached (links are signed per call); limited and retried like any provider. */
export const r2Policy: GatewayPolicy<R2Request> = {
  provider: PROVIDER,
  label: 'Cloudflare R2',
  describe: () => ({ search: false, cacheKey: null, cacheTtlS: 0 }),
  spend: null,
  concurrency: 8,
  maxQueue: 80,
  retryTries: 3,
};

const ungated: Gate = (transport) => transport;

/* A header-safe file name for Content-Disposition (ASCII fallback + UTF-8 form). */
function disposition(kind: 'attachment' | 'inline', fileName?: string): string {
  if (!fileName) return kind;
  const ascii = fileName.replace(/[^\x20-\x7e]|["\\]/g, '_');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export function r2Store(config: R2Config, deps: { fetch?: typeof fetch; now?: () => number; gate?: Gate } = {}): FileStore {
  const transport = (deps.gate ?? ungated)(createR2Transport(deps.fetch ?? fetch), r2Policy);
  const now = deps.now ?? Date.now;
  const host = new URL(config.endpoint).host;
  const creds: SigV4Creds = { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, region: 'auto', service: 's3' };
  const sign = (method: 'GET' | 'PUT' | 'DELETE', key: string, expiresS: number, query?: Record<string, string>) =>
    presign(creds, { method, host, path: keyPath(config.bucket, key), expiresS, nowMs: now(), query });

  return {
    name: PROVIDER,
    uploadTarget(key): UploadTarget {
      return { url: sign('PUT', key, UPLOAD_TTL_S), fields: {}, method: 'PUT', headers: { 'content-type': 'application/pdf' } };
    },
    async read(key, maxBytes) {
      return (await transport.call<Uint8Array | null>({ op: 'read', url: sign('GET', key, CALL_TTL_S), maxBytes })).body;
    },
    async write(key, bytes, contentType) {
      await transport.call({ op: 'write', url: sign('PUT', key, CALL_TTL_S), bytes, contentType });
    },
    downloadUrl(key, opts) {
      return sign('GET', key, opts.ttlS, {
        'response-content-disposition': disposition(opts.inline ? 'inline' : 'attachment', opts.fileName),
        'response-content-type': 'application/pdf',
      });
    },
    async remove(key) {
      await transport.call({ op: 'delete', url: sign('DELETE', key, CALL_TTL_S) });
    },
  };
}
