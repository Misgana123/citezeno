import type { Env } from './types';

/* Settings every outside-service adapter shares, from server environment variables:

     PROVIDER_CONTACT_EMAIL   sent to scholarly services so they can reach us
                              instead of blocking us (their "polite" pools)
     PROVIDER_MAX_WAIT_MS     how long a call may wait its turn in a service's
                              waiting line before the user gets "busy" (default 10000) */

export const SITE = 'https://citezeno.com';
export const DEFAULT_MAX_WAIT_MS = 10_000;

export type SharedProviderConfig = {
  contactEmail: string | null;
  maxWaitMs: number;
  /* "Citezeno/1.0 (+https://citezeno.com; mailto:…)" */
  userAgent: string;
};

const EMAIL = /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+$/;

export function sharedProviderConfig(env: Env = process.env): SharedProviderConfig {
  const email = env.PROVIDER_CONTACT_EMAIL?.trim() || '';
  const contactEmail = EMAIL.test(email) ? email : null;
  const wait = Number(env.PROVIDER_MAX_WAIT_MS);
  return {
    contactEmail,
    maxWaitMs: env.PROVIDER_MAX_WAIT_MS?.trim() && Number.isFinite(wait) && wait >= 0 ? Math.min(60_000, Math.floor(wait)) : DEFAULT_MAX_WAIT_MS,
    userAgent: `Citezeno/1.0 (+${SITE}${contactEmail ? `; mailto:${contactEmail}` : ''})`,
  };
}
