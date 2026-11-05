import type { Metadata } from 'next';
import { siteURL } from './site';

/* Search-engine metadata in one place: titles, descriptions, canonical URLs,
   Open Graph / Twitter cards and schema.org structured data (JSON-LD). */

export const SITE = {
  name: 'Citezeno',
  tagline: 'Real citations for AI-generated text',
  description:
    'Citezeno finds real, verifiable sources for the claims in your writing. Paste text from ChatGPT or any AI, and get references from OpenAlex, Crossref, Open Library and Wikipedia in APA, MLA, Chicago, Harvard, IEEE and 7 more styles. Free to start.',
  keywords: [
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

export const appLd = (o: { freeCredits: number; lowPrice?: number; highPrice?: number; currency?: string }) => ({
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  '@id': abs('/#app'),
  name: SITE.name,
  url: abs('/studio'),
  description: SITE.description,
  applicationCategory: 'EducationalApplication',
  operatingSystem: 'Any (web browser)',
  browserRequirements: 'Requires JavaScript',
  featureList: [
    'Finds real sources in OpenAlex, Crossref, Open Library and Wikipedia',
    '12 citation styles including APA 7, MLA 9, Chicago 17, Harvard, IEEE and Vancouver',
    'In-text citations, footnotes, endnotes and annotated bibliographies',
    'Word (.docx), PDF, BibTeX, RIS and CSL-JSON export',
    'Retracted works are skipped automatically',
  ],
  offers:
    o.highPrice != null
      ? { '@type': 'AggregateOffer', priceCurrency: (o.currency || 'usd').toUpperCase(), lowPrice: o.lowPrice ?? 0, highPrice: o.highPrice, offerCount: 2 }
      : { '@type': 'Offer', price: 0, priceCurrency: 'USD', description: `${o.freeCredits} free credits every month` },
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
