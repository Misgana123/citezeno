import type { Metadata } from 'next';
import { Nav } from '@/components/Nav';
import { Studio } from '@/components/studio/Studio';

export const metadata: Metadata = { title: 'Studio' };

export default function StudioPage() {
  return (
    <>
      <Nav wide />
      <main className="studio-app">
        <h1 className="sr-only">Studio</h1>
        <Studio />
      </main>
    </>
  );
}
