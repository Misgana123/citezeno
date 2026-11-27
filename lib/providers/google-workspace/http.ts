import type { ConnectorRequest, ConnectorTransport } from '../connectors/http';

/* What the Google adapters share: the provider name, and calls carrying the user's token. */

export const PROVIDER = 'google';
export const LABEL = 'Google';

export const DRIVE = 'https://www.googleapis.com/drive/v3';
export const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
export const SHEETS = 'https://sheets.googleapis.com/v4';

export type GoogleCall = <T>(req: Omit<ConnectorRequest, 'headers'> & { headers?: Record<string, string> }) => Promise<T>;

export function googleCall(transport: ConnectorTransport, accessToken: string): GoogleCall {
  return async <T>(req: Omit<ConnectorRequest, 'headers'> & { headers?: Record<string, string> }) =>
    (await transport.call<T>({ ...req, headers: { authorization: `Bearer ${accessToken}`, ...req.headers } })).body;
}

/* A Drive multipart upload body: the file's details, then its bytes. */
export function multipartRelated(metadata: unknown, media: { bytes: Uint8Array; mime: string }): { bytes: Uint8Array; contentType: string } {
  const boundary = `cz${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${media.mime}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const enc = new TextEncoder();
  const a = enc.encode(head);
  const c = enc.encode(tail);
  const out = new Uint8Array(a.byteLength + media.bytes.byteLength + c.byteLength);
  out.set(a, 0);
  out.set(media.bytes, a.byteLength);
  out.set(c, a.byteLength + media.bytes.byteLength);
  return { bytes: out, contentType: `multipart/related; boundary=${boundary}` };
}
