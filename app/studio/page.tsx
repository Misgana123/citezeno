import type { Metadata } from 'next';
import { Nav } from '@/components/Nav';
import { Studio } from '@/components/studio/Studio';
import { requireSession } from '@/lib/session';
import { pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({ title: 'Studio', path: '/studio', noindex: true });

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
