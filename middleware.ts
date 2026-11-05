import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';

/* A fast, cookie-only gate. Pages still check the session properly on the
   server; this just saves a round trip for visitors who are clearly signed out. */
export function middleware(req: NextRequest) {
  if (!getSessionCookie(req)) {
    const url = new URL('/sign-in', req.url);
    url.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/account/:path*'] };
