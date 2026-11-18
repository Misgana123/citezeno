import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell, PageHead } from '@/components/app/AppShell';
import { Icon } from '@/components/Icon';
import { Shelf } from '@/components/shelf/Shelf';
import { requireSession } from '@/lib/session';
import '../papers/papers.css';
import './shelf.css';

export const metadata: Metadata = { title: 'My shelf', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ShelfPage({ searchParams }: Props) {
  await requireSession('/shelf');
  const sp = await searchParams;
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === 'string' && k !== 'item') query.set(k, v);
  const focus = typeof sp.item === 'string' ? sp.item : null;

  return (
    <AppShell current="shelf" title="My shelf">
      <PageHead
        title="My shelf"
        actions={
          <Link className="btn btn-ghost btn-sm" href="/papers">
            <Icon name="search" /> Find papers
          </Link>
        }
      >
        Every paper you keep, in one place. Organize them into projects, tag them, take notes and track what you have read.
      </PageHead>
      <Shelf initialQuery={query.toString()} focusItem={focus} />
    </AppShell>
  );
}
