import { createHash, createHmac } from 'node:crypto';

/* AWS Signature Version 4 query-string signing ("presigned URLs"), which
   Cloudflare R2 accepts as an S3-compatible API. Local only: no network, no SDK.
   Every R2 call (browser upload, server read/write/delete, download links) is a
   presigned URL, so this is the only signing code. */

export type SigV4Creds = { accessKeyId: string; secretAccessKey: string; region: string; service: string };

/* RFC 3986 encoding, as SigV4 requires (encodeURIComponent leaves !'()* alone). */
export const rfc3986 = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

const sha256Hex = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data, 'utf8').digest();

/* "20130524T000000Z" */
export const amzDate = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export type PresignInput = {
  method: 'GET' | 'PUT' | 'DELETE' | 'HEAD';
  host: string;
  /* already-encoded path, starting with "/" */
  path: string;
  expiresS: number;
  nowMs: number;
  /* extra signed query parameters (e.g. response-content-disposition) */
  query?: Record<string, string>;
};

export function presign(creds: SigV4Creds, input: PresignInput): string {
  const stamp = amzDate(input.nowMs);
  const day = stamp.slice(0, 8);
  const scope = `${day}/${creds.region}/${creds.service}/aws4_request`;
  const params: Record<string, string> = {
    ...input.query,
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${creds.accessKeyId}/${scope}`,
    'X-Amz-Date': stamp,
    'X-Amz-Expires': String(input.expiresS),
    'X-Amz-SignedHeaders': 'host',
  };
  const query = Object.keys(params)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(params[k])}`)
    .join('&');
  const canonical = [input.method, input.path, query, `host:${input.host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', stamp, scope, sha256Hex(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${creds.secretAccessKey}`, day), creds.region), creds.service), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign, 'utf8').digest('hex');
  return `https://${input.host}${input.path}?${query}&X-Amz-Signature=${signature}`;
}

/* An object key as a URL path: each segment encoded, slashes kept. */
export const keyPath = (bucket: string, key: string) => `/${rfc3986(bucket)}/${key.split('/').map(rfc3986).join('/')}`;
