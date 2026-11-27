import type { Metadata } from 'next';
import { AppShell } from '@/components/app/AppShell';
import { Studio } from '@/components/studio/Studio';
import { requireSession } from '@/lib/session';
import { pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({ title: 'Citation', path: '/app/citation', noindex: true });

export const dynamic = 'force-dynamic';

export default async function StudioPage() {
  await requireSession('/app/citation');
  return (
    <AppShell current="citation" title="Citation" variant="panel">
      <h1 className="sr-only">Citation</h1>
      <Studio />
    </AppShell>
  );
}
