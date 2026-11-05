import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { createAuthMiddleware, isAPIError } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';
import { logActivity } from './activity';
import { twoFactor } from 'better-auth/plugins';
import { pool } from './db';
import { deleteEmail, emailEnabled, resetEmail, sendEmail, verifyEmail, welcomeEmail } from './email';
import { FREE_MONTHLY_CREDITS } from './pricing';
import { polarPlugin } from './polar';
import { siteURL } from './site';

/* Social sign-in is switched on only for providers whose keys are set. */
const social: BetterAuthOptions['socialProviders'] = {};
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  social.google = { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET };
}
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  social.github = { clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET };
}
const billing = polarPlugin();

/* Never let a failed welcome email break sign-up. */
async function welcome(user: { email: string; name: string }) {
  try {
    await sendEmail({ to: user.email, ...welcomeEmail(user.name, FREE_MONTHLY_CREDITS, `${siteURL}/studio`) });
  } catch (e) {
    console.warn('[citezeno] welcome email failed', e);
  }
}

export const enabledProviders = Object.keys(social) as ('google' | 'github')[];

const baseURL = siteURL;

/* Accept requests from the www / non-www twin too (middleware redirects pages there anyway). */
function origins() {
  const list = [baseURL];
  try {
    const u = new URL(baseURL);
    if (!/^(localhost|127\.0\.0\.1)$/.test(u.hostname)) {
      list.push(`${u.protocol}//${u.host.startsWith('www.') ? u.host.slice(4) : `www.${u.host}`}`);
    }
  } catch {
    /* invalid URL: Better Auth reports it */
  }
  return [...list, ...(process.env.TRUSTED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)];
}

export const authOptions = {
  appName: 'Citezeno',
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: pool,
  trustedOrigins: origins(),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // Without a mail provider nobody could ever confirm, so only require it when mail is set up.
    requireEmailVerification: emailEnabled,
    revokeSessionsOnPasswordReset: true,
    onPasswordReset: async ({ user }) => {
      await logActivity(user.id, 'auth.password', { meta: { via: 'reset' } });
    },
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
    afterEmailVerification: async (user) => welcome(user),
  },

  /* Security events for the history page. Errors (wrong password etc.) are skipped. */
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (isAPIError(ctx.context.returned)) return;
      const userId = ctx.context.session?.user.id || ctx.context.newSession?.user.id;
      if (!userId) return;
      if (ctx.path === '/change-password') await logActivity(userId, 'auth.password', { meta: { via: 'account' } });
      else if (ctx.path === '/two-factor/disable') await logActivity(userId, 'auth.2fa-off');
      else if (ctx.path === '/two-factor/verify-totp') {
        // verify-totp both finishes turning 2FA on and checks codes at sign-in:
        // only log "on" when the last 2FA event wasn't already "on"
        const { rows } = await pool.query<{ kind: string }>(
          `select kind from activity where "userId" = $1 and kind in ('auth.2fa-on', 'auth.2fa-off') order by "createdAt" desc limit 1`,
          [userId],
        );
        if (rows[0]?.kind !== 'auth.2fa-on') await logActivity(userId, 'auth.2fa-on');
      }
    }),
  },

  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          await logActivity(session.userId, 'auth.signin', { meta: { userAgent: session.userAgent || '', ip: session.ipAddress || '' } });
        },
      },
    },
    user: {
      create: {
        // Google/GitHub accounts arrive already confirmed; email accounts get it after confirming.
        // Without email set up nobody confirms, so welcome them straight away.
        after: async (user) => {
          if (user.emailVerified || !emailEnabled) await welcome(user);
        },
      },
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
      '/two-factor/verify-totp': { window: 60, max: 5 },
      '/two-factor/verify-backup-code': { window: 60, max: 5 },
      '/two-factor/enable': { window: 60, max: 5 },
    },
  },

  advanced: {
    // Vercel puts the visitor's address here; used for rate limiting.
    ipAddress: { ipAddressHeaders: ['x-forwarded-for', 'x-real-ip'] },
  },

  // nextCookies must stay last
  plugins: [
    // authenticator-app codes with backup codes; trusted devices skip the prompt for 30 days
    twoFactor({ issuer: 'Citezeno', backupCodeOptions: { amount: 10 } }),
    ...(billing ? [billing] : []),
    nextCookies(),
  ],
} satisfies BetterAuthOptions;

export const auth = betterAuth(authOptions);

export type Session = typeof auth.$Infer.Session;
