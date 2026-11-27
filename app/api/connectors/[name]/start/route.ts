import { auth } from '@/lib/auth';
import { beginSignIn } from '@/lib/connectors/connect';
import { failureText, redirectBack, redirectWithState } from '@/lib/connectors/redirect';
import { connectorDeps } from '@/lib/connectors/server';
import { safeBack } from '@/lib/connectors/state';
import { allow } from '@/lib/ratelimit';
import { siteURL } from '@/lib/site';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* "Connect": off to the app's own sign-in page. ?back=/app/shelf brings the
   user back there afterwards (default: Connected apps). */
export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const back = safeBack(new URL(req.url).searchParams.get('back'));
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return Response.redirect(`${siteURL}/sign-in?next=${encodeURIComponent(back)}`, 302);
  try {
    if (!(await allow(`connectors:start:${s.user.id}`, 60, 10))) return redirectBack(back, { error: 'Too many tries. Wait a minute and try again.' });
    const begun = await beginSignIn(connectorDeps(), s.user.id, name, { origin: siteURL, back });
    return redirectWithState(begun.redirect, begun.cookie);
  } catch (e) {
    return redirectBack(back, { error: failureText(e) });
  }
}
