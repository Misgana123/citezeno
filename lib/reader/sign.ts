import { createHmac, timingSafeEqual } from 'node:crypto';

/* Short-lived signed links to a PDF our server streams (open-access files we
   may not store). The signature binds the user, the paper and the expiry, and
   the route also checks the session, so a link is useless to anyone else. */

const secret = () => {
  const s = process.env.BETTER_AUTH_SECRET?.trim();
  if (!s) throw new Error('BETTER_AUTH_SECRET is not set.');
  return s;
};

const mac = (userId: string, paperId: string, exp: number, key: string) => createHmac('sha256', key).update(`reader-file\n${userId}\n${paperId}\n${exp}`).digest('base64url');

export function signFileLink(userId: string, paperId: string, ttlS: number, now = Date.now(), key = secret()): { exp: number; sig: string } {
  const exp = Math.floor(now / 1000) + ttlS;
  return { exp, sig: mac(userId, paperId, exp, key) };
}

export function checkFileLink(userId: string, paperId: string, exp: number, sig: string, now = Date.now(), key = secret()): boolean {
  if (!Number.isFinite(exp) || exp < Math.floor(now / 1000)) return false;
  const want = Buffer.from(mac(userId, paperId, exp, key));
  const got = Buffer.from(sig || '');
  return want.length === got.length && timingSafeEqual(want, got);
}
