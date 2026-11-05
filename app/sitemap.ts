import type { MetadataRoute } from 'next';
import { siteURL } from '@/lib/site';
import { STYLE_GUIDES } from '@/lib/style-guides';

/* Public, indexable pages only. Private pages (studio, account, library, history,
   admin, shared traces) are left out and blocked in robots.txt. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const page = (path: string, priority: number, changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']) => ({
    url: `${siteURL}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  });
  return [
    page('', 1, 'weekly'),
    page('/styles', 0.9, 'monthly'),
    ...Object.keys(STYLE_GUIDES).map((id) => page(`/styles/${id}`, 0.8, 'monthly')),
    page('/pricing', 0.7, 'monthly'),
    page('/sign-up', 0.6, 'yearly'),
    page('/contact', 0.4, 'yearly'),
    page('/privacy', 0.2, 'yearly'),
    page('/terms', 0.2, 'yearly'),
  ];
}
