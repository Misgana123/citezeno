/* The site's public address, e.g. https://citezeno.com. From BETTER_AUTH_URL,
   falling back to the Vercel deployment URL, then localhost. Public sites are
   always https; only localhost keeps plain http. No trailing slash. */
function resolve() {
  const raw = (
    process.env.BETTER_AUTH_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL && process.env.VERCEL_ENV === 'production'
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3000')
  ).replace(/\/+$/, '');
  return /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(raw) ? raw : raw.replace(/^http:\/\//, 'https://');
}

export const siteURL = resolve();
