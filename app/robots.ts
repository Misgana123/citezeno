import type { MetadataRoute } from 'next';
import { siteURL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/studio', '/account', '/library', '/history', '/admin', '/billing/', '/s/', '/sign-in', '/forgot-password', '/reset-password', '/verify-email', '/two-factor'],
    },
    sitemap: `${siteURL}/sitemap.xml`,
    host: siteURL,
  };
}
