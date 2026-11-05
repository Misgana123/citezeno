import 'server-only';
import { notFound } from 'next/navigation';
import { emailEnabled } from './email';
import { getSession } from './session';

/* Admins are listed by email in ADMIN_EMAILS (comma-separated). When email is
   set up they must have confirmed that address, so nobody can sign up with an
   admin's email and get in. (Without email nobody can confirm, so local
   development skips that check.) */
const ADMINS = new Set(
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

export function isAdmin(user: { email: string; emailVerified: boolean } | null | undefined) {
  return !!user && (user.emailVerified || !emailEnabled) && ADMINS.has(user.email.toLowerCase());
}

/* For admin pages: anyone else gets a plain 404, so the page's existence isn't revealed. */
export async function requireAdmin() {
  const s = await getSession();
  if (!s || !isAdmin(s.user)) notFound();
  return s;
}
