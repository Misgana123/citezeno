/* Server side of password-protected share links. Passwords are hashed with the
   same scrypt hashing Better Auth uses for account passwords; a browser that
   enters the right one gets a signed cookie for that link only. */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { hashPassword, verifyPassword } from 'better-auth/crypto';

export const hashSharePassword = (password: string) => hashPassword(password);

export async function checkSharePassword(hash: string, password: string) {
  try {
    return await verifyPassword({ hash, password });
  } catch {
    return false;
  }
}

/* One cookie per link, scoped to its page. */
export const unlockCookie = (token: string) => `cz_unlock_${token}`;

/* Tied to the current password through `tag`, a fingerprint of its hash
   (md5("sharePassword"), computed in SQL so pages never read the hash).
   Changing or removing the password locks out every browser that unlocked the old one. */
export function unlockSignature(secret: string, token: string, tag: string) {
  return createHmac('sha256', secret).update(`share-unlock:${token}:${tag}`).digest('base64url');
}

export function isUnlocked(secret: string, token: string, tag: string, cookie: string | undefined) {
  if (!cookie || !secret) return false;
  const want = Buffer.from(unlockSignature(secret, token, tag));
  const got = Buffer.from(cookie);
  return want.length === got.length && timingSafeEqual(want, got);
}

export const shareSecret = () => process.env.BETTER_AUTH_SECRET || '';
