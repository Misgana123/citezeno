import type { Metadata } from 'next';
import { AppShell } from '@/components/app/AppShell';
import { Explore } from '@/components/papers/Explore';
import { papersConfig } from '@/lib/papers/config';
import { requireSession } from '@/lib/session';
import './papers.css';
import './explore.css';

export const metadata: Metadata = { title: 'Explore', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/* Explore: browse papers by subject with shop-style filters, or search them. */
export default async function PapersPage({ searchParams }: Props) {
  await requireSession('/app/papers');
  const sp = await searchParams;
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string') query.set(k, v);
    else if (Array.isArray(v)) for (const x of v) query.append(k, x); // repeated filters (type, source)
  }

  return (
    <AppShell current="papers" title="Explore">
      <Explore initialQuery={query.toString()} maxQueryChars={papersConfig().maxQueryChars} />
    </AppShell>
  );
}
