import type { Metadata } from 'next';
import { Studio } from '@/components/studio/Studio';
import { requireSession } from '@/lib/session';
import { pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({ title: 'Studio', path: '/app/citation', noindex: true });

export const dynamic = 'force-dynamic';

export default async function StudioPage() {
  await requireSession('/app/citation');
  return (
    <main className="at-frame studio-app">
      <h1 className="sr-only">Studio</h1>
      <Studio />
    </main>
  );
}
