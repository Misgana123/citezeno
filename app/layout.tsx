import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Newsreader, Schibsted_Grotesk } from 'next/font/google';
import { CommandPalette } from '@/components/CommandPalette';
import { Toaster } from '@/components/toast';
import { SITE } from '@/lib/seo';
import { siteURL } from '@/lib/site';
import './globals.css';
import './studio.css';
import './site.css';

const ui = Schibsted_Grotesk({ subsets: ['latin'], variable: '--font-ui', display: 'swap' });
const read = Newsreader({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-read', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(siteURL),
  title: { default: 'Citezeno: real, verifiable citations for AI-generated text', template: '%s · Citezeno' },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: SITE.keywords,
  authors: [{ name: SITE.name, url: siteURL }],
  creator: SITE.name,
  publisher: SITE.name,
  category: 'education',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: SITE.name,
    url: '/',
    title: `${SITE.name}: ${SITE.tagline}`,
    description: SITE.description,
    locale: 'en_US',
  },
  twitter: { card: 'summary_large_image', title: `${SITE.name}: ${SITE.tagline}`, description: SITE.description },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
  },
  formatDetection: { telephone: false, email: false, address: false },
  // Google Search Console → Settings → Ownership verification → HTML tag → paste the content value
  ...(process.env.GOOGLE_SITE_VERIFICATION ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } } : {}),
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#133a63' },
    { media: '(prefers-color-scheme: dark)', color: '#0a1a2d' },
  ],
};

/* Applied before paint so the theme never flashes. */
const themeScript = `(function(){try{var t=localStorage.getItem('cz:theme');if(t&&t.charAt(0)=='"')t=JSON.parse(t);if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='light'}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning className={`${ui.variable} ${read.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <CommandPalette />
        <Toaster />
      </body>
    </html>
  );
}
