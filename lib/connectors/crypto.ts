import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/* Sealing connected accounts' tokens and keys (AES-256-GCM), and signing the
   short-lived sign-in state (HMAC-SHA256). Both keys come from one server
   secret, CONNECTORS_SECRET (at least 32 characters; e.g. `openssl rand -base64 32`).
   Without it, connecting apps is turned off. Changing it makes every stored
   connection unreadable: users connect again. */

export type ConnectorKeys = { seal: Buffer; sign: Buffer };

export function connectorKeys(env: Record<string, string | undefined> = process.env): ConnectorKeys | null {
  const secret = env.CONNECTORS_SECRET?.trim();
  if (!secret || secret.length < 32) return null;
  return { seal: createHash('sha256').update(`citezeno:connectors:seal:${secret}`).digest(), sign: createHash('sha256').update(`citezeno:connectors:sign:${secret}`).digest() };
}

const b64u = (b: Buffer) => b.toString('base64url');

/* JSON → "v1.<iv|tag|ciphertext>" */
export function seal(value: unknown, keys: ConnectorKeys): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keys.seal, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return `v1.${b64u(Buffer.concat([iv, cipher.getAuthTag(), data]))}`;
}

/* The sealed value, or null when it was sealed with another key or changed. */
export function unseal<T>(sealed: string, keys: ConnectorKeys): T | null {
  if (!sealed.startsWith('v1.')) return null;
  try {
    const raw = Buffer.from(sealed.slice(3), 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', keys.seal, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')) as T;
  } catch {
    return null;
  }
}

export function sign(data: string, keys: ConnectorKeys): string {
  return b64u(createHmac('sha256', keys.sign).update(data).digest());
}

export function verify(data: string, signature: string, keys: ConnectorKeys): boolean {
  const want = Buffer.from(sign(data, keys));
  const got = Buffer.from(signature);
  return want.length === got.length && timingSafeEqual(want, got);
}
