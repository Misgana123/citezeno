import type { Metadata } from 'next';
import { Nav } from '@/components/Nav';
import { Studio } from '@/components/studio/Studio';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Studio' };

export const dynamic = 'force-dynamic';

export default async function StudioPage() {
  await requireSession('/studio');
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
