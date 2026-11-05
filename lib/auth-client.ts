'use client';

import { polarClient } from '@polar-sh/better-auth/client';
import { createAuthClient } from 'better-auth/react';

/* Same origin as the app, so no baseURL is needed. */
export const authClient = createAuthClient({ plugins: [polarClient()] });

export const { useSession, signIn, signUp, signOut } = authClient;

/* Better Auth error codes → sentences people can act on. */
export function authMessage(err: { code?: string; message?: string; status?: number } | null | undefined, fallback = 'Something went wrong. Please try again.') {
  if (!err) return fallback;
  if (err.status === 429) return 'Too many attempts. Wait a minute and try again.';
  switch (err.code) {
    case 'INVALID_EMAIL_OR_PASSWORD':
      return 'That email and password don’t match an account.';
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return 'An account with this email already exists. Sign in instead.';
    case 'EMAIL_NOT_VERIFIED':
      return 'Confirm your email first. We’ve sent you a new link.';
    case 'PASSWORD_TOO_SHORT':
      return 'Use at least 8 characters for your password.';
    case 'PASSWORD_TOO_LONG':
      return 'Use at most 128 characters for your password.';
    case 'INVALID_PASSWORD':
      return 'Your current password is not right.';
    case 'INVALID_TOKEN':
      return 'This link has expired or was already used. Ask for a new one.';
    case 'INVALID_EMAIL':
      return 'Enter a valid email address.';
    default:
      return err.message || fallback;
  }
}
