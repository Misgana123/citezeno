import { createHash } from 'node:crypto';
import { ProviderError } from '../errors';
import type { GatewayPolicy, Transport } from '../gateway/types';
import type { Gate } from '../types';
import type { FileStore, UploadTarget } from '../storage/types';

/* PDF storage on Cloudinary, through its HTTP API (no SDK).

   CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>

   Files are "raw" resources of type "authenticated": never publicly readable.
   The browser uploads with a signed form; downloads use Cloudinary's
   time-limited private download links. The secret never leaves the server.
   Signing is local; the calls that reach Cloudinary (reading a file, deleting
   one) go through the gateway. */

export const PROVIDER = 'cloudinary';

export type CloudinaryCreds = { cloudName: string; apiKey: string; apiSecret: string };

export function parseCloudinaryUrl(url: string | undefined): CloudinaryCreds | null {
  const m = url?.trim().match(/^cloudinary:\/\/([^:]+):([^@]+)@([\w-]+)$/);
  return m ? { apiKey: decodeURIComponent(m[1]), apiSecret: decodeURIComponent(m[2]), cloudName: m[3] } : null;
}

/* Cloudinary's request signature: the parameters sorted by name, joined as
   key=value with "&", followed by the secret, SHA-1 in hex. Empty values are left out. */
export function signParams(params: Record<string, string | number | boolean | null | undefined>, secret: string): string {
  const base = Object.entries(params)
    .filter(([, v]) => v != null && String(v) !== '')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return createHash('sha1').update(base + secret).digest('hex');
}

const TYPE = 'authenticated';
const RESOURCE = 'raw';

/* One call to Cloudinary: download a file (through a signed link), or delete one. */
export type CloudinaryRequest = { op: 'read'; url: string; maxBytes: number } | { op: 'destroy'; url: string; body: URLSearchParams };

/* The read body: the file, or null when it is missing or larger than maxBytes. */
type ReadBody = Uint8Array | null;

function failed(op: string, status: number, extra = ''): ProviderError {
  const what = `Cloudinary ${op === 'read' ? 'download' : 'delete'} failed (${status}${extra ? ` ${extra}` : ''}).`;
  if (status === 429) return new ProviderError('busy', what, { provider: PROVIDER, status });
  return new ProviderError('unavailable', what, { provider: PROVIDER, status });
}

export function createCloudinaryTransport(doFetch: typeof fetch = fetch): Transport<CloudinaryRequest> {
  return {
    async call<T>(req: CloudinaryRequest) {
      let res: Response;
      try {
        res =
          req.op === 'read'
            ? await doFetch(req.url, { cache: 'no-store', signal: AbortSignal.timeout(30_000) })
            : await doFetch(req.url, { method: 'POST', body: req.body, signal: AbortSignal.timeout(15_000) });
      } catch (e) {
        const timedOut = (e as Error)?.name === 'TimeoutError' || (e as Error)?.name === 'AbortError';
        throw new ProviderError('unavailable', timedOut ? 'Cloudinary timed out.' : 'Could not reach Cloudinary.', { provider: PROVIDER, reason: timedOut ? 'timeout' : 'network' });
      }
      if (req.op === 'read') {
        if (res.status === 404) return { body: null as T, costUsd: 0, status: 404 };
        if (!res.ok) throw failed(req.op, res.status);
        const declared = Number(res.headers.get('content-length'));
        if (Number.isFinite(declared) && declared > req.maxBytes) return { body: null as T, costUsd: 0, status: res.status };
        const buf = new Uint8Array(await res.arrayBuffer());
        return { body: (buf.byteLength > req.maxBytes ? null : buf) as T, costUsd: 0, status: res.status };
      }
      const out = (await res.json().catch(() => ({}))) as { result?: string };
      // "not found" means it is already gone, which is what we want
      if (!res.ok || (out.result !== 'ok' && out.result !== 'not found')) throw failed(req.op, res.status, out.result ?? '');
      return { body: out as T, costUsd: 0, status: res.status };
    },
  };
}

/* Not billed per call, never cached (links are signed per call); limited and retried like any provider. */
export const cloudinaryPolicy: GatewayPolicy<CloudinaryRequest> = {
  provider: PROVIDER,
  label: 'Cloudinary',
  describe: () => ({ search: false, cacheKey: null, cacheTtlS: 0 }),
  spend: null,
  concurrency: 6,
  maxQueue: 60,
  retryTries: 3,
};

const ungated: Gate = (transport) => transport;

export function cloudinaryStore(creds: CloudinaryCreds, deps: { fetch?: typeof fetch; now?: () => number; gate?: Gate } = {}): FileStore {
  const transport = (deps.gate ?? ungated)(createCloudinaryTransport(deps.fetch ?? fetch), cloudinaryPolicy);
  const now = () => Math.floor((deps.now ?? Date.now)() / 1000);
  const api = (action: string) => `https://api.cloudinary.com/v1_1/${creds.cloudName}/${RESOURCE}/${action}`;
  const signed = (params: Record<string, string | number | boolean>) => ({ ...params, api_key: creds.apiKey, signature: signParams(params, creds.apiSecret) });

  const downloadUrl = (key: string, opts: { ttlS: number; fileName?: string }) => {
    const t = now();
    const params = signed({ public_id: key, type: TYPE, timestamp: t, expires_at: t + opts.ttlS, attachment: true, ...(opts.fileName ? { target_filename: opts.fileName } : {}) });
    return `${api('download')}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`;
  };

  return {
    name: PROVIDER,
    uploadTarget(key): UploadTarget {
      const fields = signed({ public_id: key, type: TYPE, timestamp: now() });
      return { url: api('upload'), fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, String(v)])) };
    },
    async read(key, maxBytes) {
      return (await transport.call<ReadBody>({ op: 'read', url: downloadUrl(key, { ttlS: 120 }), maxBytes })).body;
    },
    downloadUrl,
    async remove(key) {
      const body = new URLSearchParams(Object.entries(signed({ public_id: key, type: TYPE, invalidate: true, timestamp: now() })).map(([k, v]) => [k, String(v)]));
      await transport.call({ op: 'destroy', url: api('destroy'), body });
    },
  };
}
