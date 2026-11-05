import { siteURL } from '@/lib/site';
import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteURL;
  return ['', '/studio', '/styles', '/pricing', '/contact', '/sign-up', '/privacy', '/terms'].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: p === '' || p === '/studio' ? 'weekly' : 'monthly',
    priority: p === '' ? 1 : p === '/studio' ? 0.9 : 0.5,
  }));
}
