import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.BETTER_AUTH_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');
  return ['', '/studio', '/styles', '/pricing', '/contact', '/sign-up', '/privacy', '/terms'].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: p === '' || p === '/studio' ? 'weekly' : 'monthly',
    priority: p === '' ? 1 : p === '/studio' ? 0.9 : 0.5,
  }));
}
