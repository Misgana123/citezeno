import { createHash } from 'node:crypto';
import type { FileStore, UploadTarget } from './types';

/* PDF storage on Cloudinary, through its HTTP API (no SDK).

   CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>

   Files are "raw" resources of type "authenticated": never publicly readable.
   The browser uploads with a signed form; downloads use Cloudinary's
   time-limited private download links. The secret never leaves the server. */

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

export function cloudinaryStore(creds: CloudinaryCreds, deps: { fetch?: typeof fetch; now?: () => number } = {}): FileStore {
  const doFetch = deps.fetch ?? fetch;
  const now = () => Math.floor((deps.now ?? Date.now)() / 1000);
  const api = (action: string) => `https://api.cloudinary.com/v1_1/${creds.cloudName}/${RESOURCE}/${action}`;
  const signed = (params: Record<string, string | number | boolean>) => ({ ...params, api_key: creds.apiKey, signature: signParams(params, creds.apiSecret) });

  const downloadUrl = (key: string, opts: { ttlS: number; fileName?: string }) => {
    const t = now();
    const params = signed({ public_id: key, type: TYPE, timestamp: t, expires_at: t + opts.ttlS, attachment: true, ...(opts.fileName ? { target_filename: opts.fileName } : {}) });
    return `${api('download')}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`;
  };

  return {
    name: 'cloudinary',
    uploadTarget(key): UploadTarget {
      const fields = signed({ public_id: key, type: TYPE, timestamp: now() });
      return { url: api('upload'), fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, String(v)])) };
    },
    async read(key, maxBytes) {
      const res = await doFetch(downloadUrl(key, { ttlS: 120 }), { cache: 'no-store', signal: AbortSignal.timeout(30_000) });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Cloudinary download failed (${res.status}).`);
      const declared = Number(res.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > maxBytes) return null;
      const buf = new Uint8Array(await res.arrayBuffer());
      return buf.byteLength > maxBytes ? null : buf;
    },
    downloadUrl,
    async remove(key) {
      const body = new URLSearchParams(Object.entries(signed({ public_id: key, type: TYPE, invalidate: true, timestamp: now() })).map(([k, v]) => [k, String(v)]));
      const res = await doFetch(api('destroy'), { method: 'POST', body, signal: AbortSignal.timeout(15_000) });
      const out = (await res.json().catch(() => ({}))) as { result?: string };
      // "not found" means it is already gone, which is what we want
      if (!res.ok || (out.result !== 'ok' && out.result !== 'not found')) throw new Error(`Cloudinary delete failed (${res.status} ${out.result ?? ''}).`);
    },
  };
}
