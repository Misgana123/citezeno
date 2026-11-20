import type { Metadata } from 'next';
import { AppShell, PageHead } from '@/components/app/AppShell';
import { FindPapers } from '@/components/papers/FindPapers';
import { papersConfig } from '@/lib/papers/config';
import { requireSession } from '@/lib/session';
import './papers.css';

export const metadata: Metadata = { title: 'Find papers', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PapersPage({ searchParams }: Props) {
  await requireSession('/app/papers');
  const sp = await searchParams;
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === 'string') query.set(k, v);

  return (
    <AppShell current="papers" title="Find papers">
      <PageHead title="Find papers">
        Search research papers by topic, question or paragraph. Open any paper to read its abstract and explore the papers around it.
      </PageHead>
      <FindPapers initialQuery={query.toString()} maxQueryChars={papersConfig().maxQueryChars} />
    </AppShell>
  );
}
