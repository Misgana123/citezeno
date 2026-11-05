import type { Metadata } from 'next';
import { Footer, Nav } from '@/components/Nav';
import { StylesGallery } from '@/components/StylesGallery';

export const metadata: Metadata = { title: 'Citation styles' };

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
