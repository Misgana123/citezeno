import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from './auth';

export async function getSession() {
  try {
    return await auth.api.getSession({ headers: await headers() });
  } catch (e) {
    console.error('[citezeno] session lookup failed', e);
    return null;
  }
}

/* For pages that need a signed-in user. */
export async function requireSession(next: string) {
  const s = await getSession();
  if (!s) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return s;
}
