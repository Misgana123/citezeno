import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';

/* The one address the site lives at, from BETTER_AUTH_URL (e.g. citezeno.com).
   Sign-in cookies and the Google callback only work on that exact host, so
   visitors arriving on its www / non-www twin are sent there first. */
function canonicalHost() {
  try {
    const h = new URL(process.env.BETTER_AUTH_URL || '').host;
    return h && !/^(localhost|127\.0\.0\.1)(:|$)/.test(h) ? h : null;
  } catch {
    return null;
  }
}
const twin = (h: string) => (h.startsWith('www.') ? h.slice(4) : `www.${h}`);

const PROTECTED = ['/studio', '/account', '/billing', '/library', '/history', '/admin'];

export function middleware(req: NextRequest) {
  const host = req.headers.get('host') || '';
  const canon = canonicalHost();
  const path = req.nextUrl.pathname;

  // www.citezeno.com → citezeno.com (or the other way round, whichever BETTER_AUTH_URL uses).
  // API calls are left alone so webhooks configured on either host keep working.
  // Search engine verification files (public/google*.html) are served on both hosts, unredirected.
  const verification = /^\/google[\w-]+\.html$/.test(path);
  if (canon && host !== canon && host === twin(canon) && !path.startsWith('/api/') && !verification) {
    const url = new URL(req.nextUrl.pathname + req.nextUrl.search, `https://${canon}`);
    return NextResponse.redirect(url, 308);
  }

  // A fast, cookie-only gate. Pages still check the session properly on the
  // server; this just saves a round trip for visitors who are clearly signed out.
  if (PROTECTED.some((p) => path === p || path.startsWith(p + '/')) && !getSessionCookie(req)) {
    const url = new URL('/sign-in', req.url);
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'] };
