import 'server-only';
import { NextResponse } from 'next/server';
import { siteURL } from '@/lib/site';
import { isConnectorError } from './errors';
import { STATE_COOKIE, STATE_TTL_MS } from './state';

/* The browser side of signing in to an app: a top-level redirect there, and
   one back to the page the user came from, with the outcome in the address. */

const COOKIE_PATH = '/api/connectors';
const secure = siteURL.startsWith('https://');

export function redirectWithState(to: string, state: string): NextResponse {
  const res = NextResponse.redirect(to, 302);
  res.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure, sameSite: 'lax', path: COOKIE_PATH, maxAge: Math.floor(STATE_TTL_MS / 1000) });
  return res;
}

/* Back to our page: "?connected=<name>" or "?connect_error=<message>". */
export function redirectBack(back: string, outcome: { connected: string } | { error: string }): NextResponse {
  const [path, hash] = back.split('#');
  const u = new URL(path, siteURL);
  if ('connected' in outcome) u.searchParams.set('connected', outcome.connected);
  else u.searchParams.set('connect_error', outcome.error.slice(0, 200));
  const res = NextResponse.redirect(`${u.toString()}${hash ? `#${hash}` : ''}`, 302);
  res.cookies.set(STATE_COOKIE, '', { httpOnly: true, secure, sameSite: 'lax', path: COOKIE_PATH, maxAge: 0 });
  return res;
}

export function failureText(e: unknown): string {
  if (isConnectorError(e)) return e.message;
  console.error('[citezeno] connectors: sign-in failed', e);
  return 'The app couldn’t be connected. Please try again.';
}
