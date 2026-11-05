import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { pool } from './db';
import { deleteEmail, emailEnabled, resetEmail, sendEmail, verifyEmail } from './email';

/* Social sign-in is switched on only for providers whose keys are set. */
const social: BetterAuthOptions['socialProviders'] = {};
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  social.google = { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET };
}
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  social.github = { clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET };
}
export const enabledProviders = Object.keys(social) as ('google' | 'github')[];

/* On Vercel, fall back to the deployment's own URL when BETTER_AUTH_URL is unset. */
const baseURL =
  process.env.BETTER_AUTH_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL && process.env.VERCEL_ENV === 'production'
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000');

export const authOptions = {
  appName: 'Citezeno',
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: pool,
  trustedOrigins: [baseURL, ...(process.env.TRUSTED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)],

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // Without a mail provider nobody could ever confirm, so only require it when mail is set up.
    requireEmailVerification: emailEnabled,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({ to: user.email, ...resetEmail(url) });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({ to: user.email, ...verifyEmail(user.name, url) });
    },
  },

  socialProviders: social,

  account: {
    accountLinking: { enabled: true, trustedProviders: ['google', 'github'] },
  },

  user: {
    deleteUser: {
      enabled: true,
      // With mail set up, deleting needs a click in an email; otherwise it is immediate.
      sendDeleteAccountVerification: emailEnabled
        ? async ({ user, url }) => {
            await sendEmail({ to: user.email, ...deleteEmail(url) });
          }
        : undefined,
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },

  rateLimit: {
    enabled: true,
    storage: 'database',
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
      '/sign-up/email': { window: 60 * 10, max: 5 },
      '/request-password-reset': { window: 60 * 10, max: 3 },
      '/send-verification-email': { window: 60 * 10, max: 3 },
      '/change-password': { window: 60, max: 5 },
      '/delete-user': { window: 60 * 10, max: 3 },
    },
  },

  advanced: {
    // Vercel puts the visitor's address here; used for rate limiting.
    ipAddress: { ipAddressHeaders: ['x-forwarded-for', 'x-real-ip'] },
  },

  plugins: [nextCookies()],
} satisfies BetterAuthOptions;

export const auth = betterAuth(authOptions);

export type Session = typeof auth.$Infer.Session;
