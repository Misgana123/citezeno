import { cookies } from 'next/headers';
import { auth } from '@/lib/auth';
import { finishSignIn } from '@/lib/connectors/connect';
import { failureText, redirectBack } from '@/lib/connectors/redirect';
import { connectorDeps } from '@/lib/connectors/server';
import { readState, safeBack, STATE_COOKIE } from '@/lib/connectors/state';
import { connectorKeys } from '@/lib/connectors/crypto';
import { siteURL } from '@/lib/site';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Back from the app's sign-in page: keep the connection, return to where the user was. */
export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return Response.redirect(`${siteURL}/sign-in?next=${encodeURIComponent('/app/chat?settings=customize')}`, 302);
  const cookie = (await cookies()).get(STATE_COOKIE)?.value;
  const keys = connectorKeys();
  // where to go back to, even when the sign-in fails
  const pending = keys ? readState(cookie, keys, { userId: s.user.id, connector: name, nonce: null }) : null;
  const fallback = safeBack(pending?.back);
  try {
    const done = await finishSignIn(connectorDeps(), s.user.id, name, { origin: siteURL, params: new URL(req.url).searchParams, cookie });
    return redirectBack(safeBack(done.back), { connected: name });
  } catch (e) {
    return redirectBack(fallback, { error: failureText(e) });
  }
}
