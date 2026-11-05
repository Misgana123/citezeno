import type { Metadata } from 'next';
import { Footer, Nav } from '@/components/Nav';
import { StylesGallery } from '@/components/StylesGallery';
import { pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({
  title: 'Citation styles: APA, MLA, Chicago, Harvard, IEEE and more',
  description:
    'Examples of all 12 citation styles Citezeno supports (APA 7, MLA 9, Chicago 17, Turabian, Harvard, ASA, IEEE, Vancouver, AMA, ACS and CSE) for journal articles, books and web pages.',
  path: '/styles',
});

export default function StylesPage() {
  return (
    <>
      <Nav />
      <main className="wrap gallery-page">
        <header className="gallery-head">
          <h1 className="h2">Citation styles</h1>
          <p className="lede">
            All twelve styles Citezeno supports, each shown with the same record. Switch the source type to compare
            how a style treats articles, books and web pages.
          </p>
        </header>
        <StylesGallery />
      </main>
      <Footer />
    </>
  );
}
