import type { Metadata } from 'next';
import { siteURL } from './site';

/* Search-engine metadata in one place: titles, descriptions, canonical URLs,
   Open Graph / Twitter cards and schema.org structured data (JSON-LD). */

export const SITE = {
  name: 'Citezeno',
  tagline: 'AI research with real sources',
  description:
    'Citezeno is an AI research platform. Ask a question and get an answer where every claim links to a real paper or page, run deep research reports, search 250M+ scholarly works, ask questions of any PDF, keep a shelf of papers and cite them in APA, MLA, Chicago and 9 more styles.',
  keywords: [
    'AI research assistant',
    'AI for academic research',
    'deep research',
    'literature review AI',
    'chat with PDF',
    'research paper search',
    'citation generator',
    'AI citation finder',
    'find sources for essay',
    'reference generator',
    'APA citation generator',
    'MLA citation generator',
    'Chicago citation generator',
    'Harvard referencing generator',
    'IEEE citation generator',
    'fake citations ChatGPT',
    'verify AI citations',
    'bibliography generator',
    'footnote generator',
    'academic sources finder',
  ],
};

export const abs = (path = '/') => `${siteURL}${path === '/' ? '' : path}`;

/* Metadata for one page: canonical URL plus matching Open Graph and Twitter tags. */
export function pageMeta(o: { title?: string; description?: string; path: string; noindex?: boolean; ogType?: 'website' | 'article'; image?: string }): Metadata {
  const description = o.description ?? SITE.description;
  const title = o.title;
  // titles that already start with the brand aren't suffixed again
  const social = title ? (title.startsWith(SITE.name) ? title : `${title} · ${SITE.name}`) : `${SITE.name}: ${SITE.tagline}`;
  // pages that define their own Open Graph tags would otherwise lose the site-wide card;
  // a route's own opengraph-image file still takes precedence over this
  const images = [{ url: o.image ?? '/opengraph-image', width: 1200, height: 630, alt: `${SITE.name}: ${SITE.tagline}` }];
  return {
    ...(title ? { title } : {}),
    description,
    alternates: { canonical: o.path },
    openGraph: {
      type: o.ogType ?? 'website',
      url: o.path,
      siteName: SITE.name,
      title: social,
      description,
      locale: 'en_US',
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title: social,
      description,
      images: images.map((i) => i.url),
    },
    ...(o.noindex ? { robots: { index: false, follow: false } } : {}),
  };
}

/* ---------- JSON-LD builders ---------- */

export const organizationLd = () => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': abs('/#organization'),
  name: SITE.name,
  url: abs('/'),
  logo: abs('/icon.svg'),
  contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', url: abs('/contact') },
});

export const websiteLd = () => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': abs('/#website'),
  name: SITE.name,
  url: abs('/'),
  description: SITE.description,
  publisher: { '@id': abs('/#organization') },
  inLanguage: 'en',
});

export const appLd = (o: { lowPrice?: number; highPrice?: number; currency?: string } = {}) => ({
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  '@id': abs('/#app'),
  name: SITE.name,
  url: abs('/app/chat'),
  description: SITE.description,
  applicationCategory: 'EducationalApplication',
  operatingSystem: 'Any (web browser)',
  browserRequirements: 'Requires JavaScript',
  featureList: [
    'Research assistant whose answers link every claim to a real source',
    'Deep research reports with numbered sources',
    'Search 250M+ scholarly works and save them to a shelf',
    'Ask questions of any PDF, answered with the page it came from',
    'Finds real sources for a draft in OpenAlex, Crossref, Open Library and Wikipedia',
    '12 citation styles including APA 7, MLA 9, Chicago 17, Harvard, IEEE and Vancouver',
    'In-text citations, footnotes, endnotes and annotated bibliographies',
    'Word (.docx), PDF, BibTeX, RIS and CSL-JSON export',
    'Retracted works are skipped automatically',
  ],
  offers:
    o.highPrice != null
      ? { '@type': 'AggregateOffer', priceCurrency: (o.currency || 'usd').toUpperCase(), lowPrice: o.lowPrice ?? 7, highPrice: o.highPrice, offerCount: 3 }
      : { '@type': 'Offer', price: 7, priceCurrency: 'USD', description: 'Starter plan, 700 credits a month' },
  publisher: { '@id': abs('/#organization') },
});

export const faqLd = (items: [string, string][]) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: items.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
});

export const breadcrumbLd = (trail: [string, string][]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: trail.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(path) })),
});

export const howToLd = (o: { name: string; description: string; steps: [string, string][] }) => ({
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: o.name,
  description: o.description,
  step: o.steps.map(([name, text], i) => ({ '@type': 'HowToStep', position: i + 1, name, text })),
});
