import type { Metadata } from 'next';
import { AppShell } from '@/components/app/AppShell';
import { ShelfPage as ShelfSpaces } from '@/components/shelf/ShelfPage';
import { requireSession } from '@/lib/session';
import '../papers/papers.css';
import './shelf.css';

export const metadata: Metadata = { title: 'My shelf', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/* My shelf: the app's menu folds to its icons, the shelf's own sidebar
   (collections, projects, tags) beside the papers, filling the window. */
export default async function ShelfPage({ searchParams }: Props) {
  await requireSession('/app/shelf');
  const sp = await searchParams;
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === 'string' && k !== 'item') query.set(k, v);
  const focus = typeof sp.item === 'string' ? sp.item : null;

  return (
    <AppShell current="shelf" title="My shelf" variant="panel" rail>
      <ShelfSpaces initialQuery={query.toString()} focusItem={focus} />
    </AppShell>
  );
}
