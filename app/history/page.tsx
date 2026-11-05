import type { Metadata } from 'next';
import Link from 'next/link';
import { ClearHistory } from '@/components/history/ClearHistory';
import { HistoryList } from '@/components/history/HistoryList';
import { Icon } from '@/components/Icon';
import { Footer, Nav } from '@/components/Nav';
import { FILTERS, loadHistory, type HistoryFilter } from '@/lib/history';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'History', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function HistoryPage({ searchParams }: Props) {
  const session = await requireSession('/history');
  const sp = await searchParams;
  const filter = (FILTERS.some((f) => f.id === sp.type) ? sp.type : 'all') as HistoryFilter;
  const before = typeof sp.before === 'string' ? sp.before : null;
  const { items, next } = await loadHistory(session.user.id, { filter, before });

  const q = (o: Record<string, string | null>) => {
    const p = new URLSearchParams();
    if (o.type && o.type !== 'all') p.set('type', o.type);
    if (o.before) p.set('before', o.before);
    const s = p.toString();
    return `/history${s ? `?${s}` : ''}`;
  };

  return (
    <>
      <Nav />
      <main className="wrap page">
        <header className="page-head hist-head">
          <div>
            <h1 className="h2">History</h1>
            <p className="lede">Everything you’ve done in Citezeno: traces, credits, sharing and sign-ins, newest first.</p>
          </div>
          <div className="hist-tools">
            <a className="btn btn-ghost btn-sm" href="/api/history" download>
              <Icon name="download" /> Download CSV
            </a>
            <ClearHistory />
          </div>
        </header>

        <nav className="hist-filters" aria-label="Filter history">
          {FILTERS.map((f) => (
            <Link key={f.id} href={q({ type: f.id })} aria-current={filter === f.id ? 'page' : undefined}>
              {f.label}
            </Link>
          ))}
        </nav>

        {!items.length ? (
          <div className="lib-empty">
            <Icon name="history" />
            <h2 className="h3">{before ? 'No older activity' : 'Nothing here yet'}</h2>
            <p>{filter === 'all' ? 'Run a trace in the studio and it will show up here.' : 'No activity of this kind yet.'}</p>
            <Link className="btn btn-thread" href="/studio">
              Open the studio
            </Link>
          </div>
        ) : (
          <HistoryList items={items} />
        )}

        {(next || before) && (
          <div className="hist-pager">
            {before && (
              <Link className="btn btn-ghost btn-sm" href={q({ type: filter })}>
                Back to newest
              </Link>
            )}
            {next && (
              <Link className="btn btn-ghost btn-sm" href={q({ type: filter, before: next })}>
                Older activity
              </Link>
            )}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
