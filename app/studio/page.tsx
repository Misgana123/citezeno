import type { Metadata } from 'next';
import { Studio } from '@/components/studio/Studio';
import { requireSession } from '@/lib/session';
import { pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({ title: 'Studio', path: '/studio', noindex: true });

export const dynamic = 'force-dynamic';

export default async function StudioPage() {
  await requireSession('/studio');
  return (
    <main className="at-frame studio-app">
      <h1 className="sr-only">Studio</h1>
      <Studio />
    </main>
  );
}
