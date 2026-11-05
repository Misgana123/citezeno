import { siteURL } from '@/lib/site';
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = siteURL;
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/account', '/reset-password', '/verify-email', '/billing/', '/studio'] },
    sitemap: `${base}/sitemap.xml`,
  };
}
